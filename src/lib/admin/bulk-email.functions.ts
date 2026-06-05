import { createServerFn } from '@tanstack/react-start';
import { useSession } from '@tanstack/react-start/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendCustomEmail } from '@/lib/email/sendCustomEmail.server';

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
    console.error('[bulk-email] auth fail', err);
    throw new Error('Não autorizado');
  }
}

export interface BulkEmailRecipient {
  id: string;
  external_reference: string;
  email: string;
  nome: string | null;
  created_at: string;
}

// ===== Listar destinatários por data =====

export const adminListRecipientsByDate = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z
      .object({
        // yyyy-mm-dd
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'data inválida (use yyyy-mm-dd)'),
        // se true, considera apenas pedidos pagos
        paidOnly: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ total: number; recipients: BulkEmailRecipient[] }> => {
      await ensureAdmin();

      // Janela do dia em UTC. Como created_at é timestamptz, comparar em ISO funciona,
      // mas a "data" é interpretada no fuso de São Paulo (-03:00) para refletir o dia comercial.
      const start = new Date(`${data.date}T00:00:00-03:00`).toISOString();
      const end = new Date(`${data.date}T23:59:59.999-03:00`).toISOString();

      let q = supabaseAdmin
        .from('orders')
        .select('id, external_reference, tracking_payload, status, created_at')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true })
        .limit(2000);

      if (data.paidOnly) q = q.eq('status', 'paid');

      const { data: rows, error } = await q;
      if (error) {
        console.error('[bulk-email] erro list por data', error);
        throw new Error('Erro ao listar pedidos da data');
      }

      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const seen = new Set<string>();
      const recipients: BulkEmailRecipient[] = [];

      for (const r of rows || []) {
        const tp = ((r as any).tracking_payload || {}) as {
          name?: string;
          email?: string;
        };
        const email = (tp.email || '').trim().toLowerCase();
        if (!email || !emailRe.test(email)) continue;
        if (seen.has(email)) continue; // dedupe por email
        seen.add(email);
        recipients.push({
          id: (r as any).id,
          external_reference: (r as any).external_reference,
          email,
          nome: tp.name || null,
          created_at: (r as any).created_at,
        });
      }

      return { total: recipients.length, recipients };
    },
  );

// ===== Enviar e-mail em massa (lote) =====

export interface BulkEmailSendResult {
  results: Array<{
    id: string;
    email: string;
    ok: boolean;
    skipped?: 'already_sent' | 'invalid_email';
    error?: string;
    emailId?: string;
  }>;
}

export const adminSendBulkEmailBatch = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(10),
        subject: z.string().trim().min(1).max(180),
        message: z.string().trim().min(1).max(5000),
        // chave estável da campanha (ex: data + hash do conteúdo). Bloqueia duplicidade.
        campaignKey: z.string().trim().min(4).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<BulkEmailSendResult> => {
    await ensureAdmin();

    const results: BulkEmailSendResult['results'] = [];

    // Carrega pedidos do lote
    const { data: rows, error } = await supabaseAdmin
      .from('orders')
      .select('id, external_reference, tracking_payload')
      .in('id', data.ids);

    if (error) {
      console.error('[bulk-email] erro fetch lote', error);
      throw new Error('Erro ao carregar pedidos do lote');
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const row of rows || []) {
      const id = (row as any).id as string;
      const codigo = (row as any).external_reference as string;
      const tp = ((row as any).tracking_payload || {}) as {
        name?: string;
        email?: string;
      };
      const email = (tp.email || '').trim().toLowerCase();
      const nome = tp.name || null;

      if (!email || !emailRe.test(email)) {
        results.push({ id, email, ok: false, skipped: 'invalid_email' });
        continue;
      }

      // Reserva (anti-duplicidade): tenta inserir log com status pending; conflito => já enviado
      const { error: claimErr } = await supabaseAdmin
        .from('bulk_email_log' as any)
        .insert({
          order_id: id,
          external_reference: codigo,
          email,
          subject: data.subject,
          message: data.message,
          campaign_key: data.campaignKey,
          status: 'pending',
        } as any);

      if (claimErr) {
        // 23505 = unique violation => já existe envio para esse email nesta campanha
        if ((claimErr as any).code === '23505') {
          results.push({ id, email, ok: false, skipped: 'already_sent' });
          continue;
        }
        console.error('[bulk-email] claim erro', claimErr);
        results.push({ id, email, ok: false, error: 'claim error' });
        continue;
      }

      // Envia
      const sent = await sendCustomEmail({
        emailCliente: email,
        nomeCliente: nome,
        codigoPedido: codigo,
        subject: data.subject,
        message: data.message,
      });

      // Atualiza log
      await supabaseAdmin
        .from('bulk_email_log' as any)
        .update({
          status: sent.ok ? 'sent' : 'failed',
          resend_id: sent.id || null,
          error: sent.ok ? null : sent.error || 'erro desconhecido',
        } as any)
        .eq('campaign_key', data.campaignKey)
        .eq('email', email);

      results.push({
        id,
        email,
        ok: sent.ok,
        emailId: sent.id,
        error: sent.ok ? undefined : sent.error,
      });
    }

    return { results };
  });

// ===== Disparo único: aviso de problema no envio =====

export const adminSendProblemaEnvioEmail = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({ codigoPedido: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; error?: string; skipped?: string }> => {
      await ensureAdmin();

      const { data: order, error } = await supabaseAdmin
        .from('orders')
        .select('id, external_reference, tracking_payload')
        .eq('external_reference', data.codigoPedido)
        .maybeSingle();

      if (error) {
        console.error('[bulk-email] erro fetch pedido', error);
        return { ok: false, error: 'erro ao buscar pedido' };
      }
      if (!order) return { ok: false, skipped: 'order_not_found' };

      const tp = ((order as any).tracking_payload || {}) as {
        name?: string;
        email?: string;
      };
      const email = (tp.email || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { ok: false, skipped: 'invalid_email' };
      }

      const subject = '⚠️ Atenção: problema com o envio do seu pedido';
      const message = `Olá! Identificamos um problema com o envio do seu pedido.

Pode ser uma divergência no endereço, dado de entrega faltando ou algum imprevisto com a transportadora.

Por favor, responda este e-mail ou nos chame no WhatsApp para resolvermos rapidamente. Estamos prontos para te ajudar.

Obrigado pela compreensão. 💖`;

      const campaignKey = `problema-envio-${data.codigoPedido}`;

      // Anti-duplicidade
      const { error: claimErr } = await supabaseAdmin
        .from('bulk_email_log' as any)
        .insert({
          order_id: (order as any).id,
          external_reference: (order as any).external_reference,
          email,
          subject,
          message,
          campaign_key: campaignKey,
          status: 'pending',
        } as any);

      if (claimErr) {
        if ((claimErr as any).code === '23505') {
          return { ok: false, skipped: 'already_sent' };
        }
        return { ok: false, error: 'claim error' };
      }

      const sent = await sendCustomEmail({
        emailCliente: email,
        nomeCliente: tp.name || null,
        codigoPedido: (order as any).external_reference,
        subject,
        message,
      });

      await supabaseAdmin
        .from('bulk_email_log' as any)
        .update({
          status: sent.ok ? 'sent' : 'failed',
          resend_id: sent.id || null,
          error: sent.ok ? null : sent.error || 'erro desconhecido',
        } as any)
        .eq('campaign_key', campaignKey)
        .eq('email', email);

      return { ok: sent.ok, error: sent.ok ? undefined : sent.error };
    },
  );
