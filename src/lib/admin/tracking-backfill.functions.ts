import { createServerFn } from '@tanstack/react-start';
import { useSession } from '@tanstack/react-start/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendTrackingEmail } from '@/lib/email/sendTrackingEmail.server';
import { DEFAULT_RASTREIO_STATUS } from '@/lib/rastreios/statuses';

// Mesma sessão usada pelo /admin/rastreios
const SESSION_NAME = 'cc_admin_rastreios';
const SESSION_MAX_AGE = 60 * 60 * 8;

interface AdminSessionData {
  isAdmin?: boolean;
  loggedAt?: number;
}

function sessionConfig() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('ADMIN_PASSWORD ausente ou muito curta');
  }
  const padded = password.padEnd(32, password);
  return {
    password: padded,
    name: SESSION_NAME,
    maxAge: SESSION_MAX_AGE,
    cookie: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: true,
      path: '/',
    },
  };
}

async function ensureAdmin() {
  try {
    const session = await useSession<AdminSessionData>(sessionConfig());
    if (!session.data?.isAdmin) throw new Error('Não autorizado');
  } catch (err) {
    console.error('[tracking-backfill] auth fail', err);
    throw new Error('Não autorizado');
  }
}

export interface PendingTrackingOrder {
  id: string;
  external_reference: string;
  nome: string | null;
  email: string;
  approved_at: string | null;
}

export const adminListPendingTrackingEmails = createServerFn({ method: 'POST' }).handler(
  async (): Promise<{ total: number; orders: PendingTrackingOrder[] }> => {
    await ensureAdmin();

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, external_reference, approved_at, tracking_payload')
      .eq('status', 'paid')
      .is('tracking_email_sent_at' as any, null)
      .order('approved_at', { ascending: true })
      .limit(2000);

    if (error) {
      console.error('[tracking-backfill] erro list', error);
      throw new Error('Erro ao listar pedidos');
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const orders: PendingTrackingOrder[] = [];
    for (const row of data || []) {
      const tp = ((row as any).tracking_payload || {}) as { name?: string; email?: string };
      const email = (tp.email || '').trim();
      if (!email || !emailRe.test(email)) continue;
      orders.push({
        id: (row as any).id,
        external_reference: (row as any).external_reference,
        nome: tp.name || null,
        email,
        approved_at: (row as any).approved_at,
      });
    }

    return { total: orders.length, orders };
  },
);

export interface SendBatchResult {
  results: Array<{
    id: string;
    external_reference: string;
    ok: boolean;
    skipped?: 'already_sent' | 'invalid_email';
    error?: string;
    emailId?: string;
  }>;
}

export const adminSendTrackingEmailsBatch = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(10) }).parse(input),
  )
  .handler(async ({ data }): Promise<SendBatchResult> => {
    await ensureAdmin();

    const results: SendBatchResult['results'] = [];

    for (const id of data.ids) {
      // Claim atômico
      const { data: claimed, error: claimErr } = await supabaseAdmin
        .from('orders')
        .update({ tracking_email_sent_at: new Date().toISOString() } as any)
        .eq('id', id)
        .eq('status', 'paid')
        .is('tracking_email_sent_at' as any, null)
        .select('id, external_reference, tracking_payload')
        .maybeSingle();

      if (claimErr) {
        console.error('[tracking-backfill] claim erro', { id, claimErr });
        results.push({ id, external_reference: '', ok: false, error: 'claim error' });
        continue;
      }
      if (!claimed) {
        console.log('[tracking-backfill] já enviado', { id });
        results.push({ id, external_reference: '', ok: false, skipped: 'already_sent' });
        continue;
      }

      const codigo = (claimed as any).external_reference as string;
      const tp = ((claimed as any).tracking_payload || {}) as { name?: string; email?: string };
      const email = (tp.email || '').trim();
      const nome = tp.name || '';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await supabaseAdmin
          .from('orders')
          .update({ tracking_email_sent_at: null } as any)
          .eq('id', id);
        results.push({ id, external_reference: codigo, ok: false, skipped: 'invalid_email' });
        continue;
      }

      // Garantir registro de rastreio (não sobrescreve)
      try {
        const { data: existing } = await supabaseAdmin
          .from('rastreios' as any)
          .select('codigo_pedido')
          .eq('codigo_pedido', codigo)
          .maybeSingle();
        if (!existing) {
          await supabaseAdmin
            .from('rastreios' as any)
            .insert({ codigo_pedido: codigo, status: DEFAULT_RASTREIO_STATUS } as any);
        }
      } catch (err) {
        console.error('[tracking-backfill] rastreio upsert err', { id, err });
        // segue mesmo assim
      }

      // Envia email
      const sent = await sendTrackingEmail({
        nomeCliente: nome,
        emailCliente: email,
        codigoPedido: codigo,
      });

      if (!sent.ok) {
        // rollback
        await supabaseAdmin
          .from('orders')
          .update({ tracking_email_sent_at: null } as any)
          .eq('id', id);
        console.error('[tracking-backfill] envio falhou', { id, err: sent.error });
        results.push({ id, external_reference: codigo, ok: false, error: sent.error });
        continue;
      }

      console.log('[tracking-backfill] enviado', { id, codigo, emailId: sent.id });
      results.push({ id, external_reference: codigo, ok: true, emailId: sent.id });
    }

    return { results };
  });

// =====================================================================
// REENVIO EM MASSA (force) — usa o NOVO template para todos os pedidos pagos
// =====================================================================

export interface ResendTarget {
  id: string;
  external_reference: string;
  nome: string | null;
  email: string;
  approved_at: string | null;
}

export const adminListAllPaidForResend = createServerFn({ method: 'POST' }).handler(
  async (): Promise<{ total: number; orders: ResendTarget[] }> => {
    await ensureAdmin();

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('id, external_reference, approved_at, tracking_payload')
      .eq('status', 'paid')
      .order('approved_at', { ascending: false })
      .limit(5000);

    if (error) {
      console.error('[tracking-resend] erro list', error);
      throw new Error('Erro ao listar pedidos');
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const orders: ResendTarget[] = [];
    const seenEmails = new Set<string>();
    for (const row of data || []) {
      const tp = ((row as any).tracking_payload || {}) as { name?: string; email?: string };
      const email = (tp.email || '').trim().toLowerCase();
      if (!email || !emailRe.test(email)) continue;
      // dedup por email — evita enviar 2x para o mesmo cliente que tem múltiplos pedidos
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);
      orders.push({
        id: (row as any).id,
        external_reference: (row as any).external_reference,
        nome: tp.name || null,
        email,
        approved_at: (row as any).approved_at,
      });
    }

    return { total: orders.length, orders };
  },
);

export interface ResendBatchResult {
  results: Array<{
    id: string;
    external_reference: string;
    ok: boolean;
    error?: string;
    skipped?: 'invalid_email';
    emailId?: string;
  }>;
}

export const adminResendTrackingEmailsBatch = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(10) }).parse(input),
  )
  .handler(async ({ data }): Promise<ResendBatchResult> => {
    await ensureAdmin();

    const results: ResendBatchResult['results'] = [];

    for (const id of data.ids) {
      const { data: order, error: fetchErr } = await supabaseAdmin
        .from('orders')
        .select('id, external_reference, tracking_payload, status')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr || !order) {
        results.push({ id, external_reference: '', ok: false, error: 'order not found' });
        continue;
      }
      if ((order as any).status !== 'paid') {
        results.push({ id, external_reference: (order as any).external_reference, ok: false, error: 'not paid' });
        continue;
      }

      const codigo = (order as any).external_reference as string;
      const tp = ((order as any).tracking_payload || {}) as { name?: string; email?: string };
      const email = (tp.email || '').trim();
      const nome = tp.name || '';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({ id, external_reference: codigo, ok: false, skipped: 'invalid_email' });
        continue;
      }

      // garantir registro de rastreio
      try {
        const { data: existing } = await supabaseAdmin
          .from('rastreios' as any)
          .select('codigo_pedido')
          .eq('codigo_pedido', codigo)
          .maybeSingle();
        if (!existing) {
          await supabaseAdmin
            .from('rastreios' as any)
            .insert({ codigo_pedido: codigo, status: DEFAULT_RASTREIO_STATUS } as any);
        }
      } catch (err) {
        console.error('[tracking-resend] rastreio upsert err', { id, err });
      }

      const sent = await sendTrackingEmail({
        nomeCliente: nome,
        emailCliente: email,
        codigoPedido: codigo,
      });

      if (!sent.ok) {
        console.error('[tracking-resend] envio falhou', { id, err: sent.error });
        results.push({ id, external_reference: codigo, ok: false, error: sent.error });
        continue;
      }

      // atualiza timestamp (apenas marcador — não é claim)
      await supabaseAdmin
        .from('orders')
        .update({ tracking_email_sent_at: new Date().toISOString() } as any)
        .eq('id', id);

      console.log('[tracking-resend] enviado', { id, codigo, emailId: sent.id });
      results.push({ id, external_reference: codigo, ok: true, emailId: sent.id });
    }

    return { results };
  });
