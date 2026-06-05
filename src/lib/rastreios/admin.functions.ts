import { createServerFn } from '@tanstack/react-start';
import { useSession } from '@tanstack/react-start/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { RASTREIO_STATUSES, PROBLEMA_ENVIO_STATUS } from './statuses';
import { sendCustomEmail } from '@/lib/email/sendCustomEmail.server';

const PROBLEMA_SUBJECT = '⚠️ Atenção: problema com o envio do seu pedido';
const PROBLEMA_MESSAGE = `Olá! Identificamos um problema com o envio do seu pedido.

Pode ser uma divergência no endereço, dado de entrega faltando ou algum imprevisto com a transportadora.

Por favor, responda este e-mail ou nos chame no WhatsApp para resolvermos rapidamente. Estamos prontos para te ajudar.

Obrigado pela compreensão. 💖`;

async function fetchOrderByCodigo(codigo: string) {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('id, external_reference, tracking_payload')
    .eq('external_reference', codigo)
    .maybeSingle();
  return data as
    | { id: string; external_reference: string; tracking_payload: any }
    | null;
}

async function notifyProblemaEnvio(codigo: string): Promise<void> {
  try {
    const order = await fetchOrderByCodigo(codigo);
    if (!order) return;
    const tp = (order.tracking_payload || {}) as { name?: string; email?: string };
    const email = (tp.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const campaignKey = `problema-envio-${codigo}`;
    // anti-duplicidade via unique index
    const { error: claimErr } = await supabaseAdmin
      .from('bulk_email_log' as any)
      .insert({
        order_id: order.id,
        external_reference: codigo,
        email,
        subject: PROBLEMA_SUBJECT,
        message: PROBLEMA_MESSAGE,
        campaign_key: campaignKey,
        status: 'pending',
      } as any);
    if (claimErr) {
      // já enviado anteriormente
      return;
    }

    const sent = await sendCustomEmail({
      emailCliente: email,
      nomeCliente: tp.name || null,
      codigoPedido: codigo,
      subject: PROBLEMA_SUBJECT,
      message: PROBLEMA_MESSAGE,
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
  } catch (err) {
    console.error('[notifyProblemaEnvio] erro', err);
  }
}

const SESSION_NAME = 'cc_admin_rastreios';
const SESSION_MAX_AGE = 60 * 60 * 8; // 8h

interface AdminSessionData {
  isAdmin?: boolean;
  loggedAt?: number;
}

function sessionConfig() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('ADMIN_PASSWORD ausente ou muito curta (mínimo 8 caracteres)');
  }
  // Pad password to >=32 chars (requirement of underlying encryption)
  const paddedPassword = password.padEnd(32, password);
  return {
    password: paddedPassword,
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

async function isAdminFromSession(): Promise<boolean> {
  try {
    const session = await useSession<AdminSessionData>(sessionConfig());
    return Boolean(session.data?.isAdmin);
  } catch (err) {
    console.error('[admin] erro lendo sessão', err);
    return false;
  }
}

// ===== Auth =====

export const adminLogin = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({ password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return { ok: false as const, error: 'server misconfigured' };

    if (data.password !== expected) {
      return { ok: false as const, error: 'Senha incorreta' };
    }
    const session = await useSession<AdminSessionData>(sessionConfig());
    await session.update({ isAdmin: true, loggedAt: Date.now() });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await useSession<AdminSessionData>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const adminCheck = createServerFn({ method: 'GET' }).handler(async () => {
  return { isAdmin: await isAdminFromSession() };
});

// ===== Rastreios CRUD =====

async function ensureAdmin() {
  const ok = await isAdminFromSession();
  if (!ok) throw new Error('Não autorizado');
}

export interface AdminRastreio {
  id: string;
  codigo_pedido: string;
  status: string;
  observacao: string | null;
  ultima_atualizacao: string;
  created_at: string;
}

export const adminListRastreios = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<AdminRastreio[]> => {
    await ensureAdmin();
    let q = supabaseAdmin
      .from('rastreios' as any)
      .select('id, codigo_pedido, status, observacao, ultima_atualizacao, created_at')
      .order('ultima_atualizacao', { ascending: false })
      .limit(data.limit ?? 200);

    if (data.search && data.search.length > 0) {
      q = q.ilike('codigo_pedido', `%${data.search}%`);
    }

    const { data: rows, error } = await q;
    if (error) {
      console.error('[adminListRastreios] erro', error);
      throw new Error('Erro ao listar rastreios');
    }
    return (rows as unknown as AdminRastreio[]) || [];
  });

export const adminCreateRastreio = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z
      .object({
        codigo_pedido: z.string().trim().min(1).max(120),
        status: z.enum(RASTREIO_STATUSES).optional(),
        observacao: z.string().trim().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<AdminRastreio> => {
    await ensureAdmin();
    const payload: Record<string, unknown> = {
      codigo_pedido: data.codigo_pedido,
    };
    if (data.status) payload.status = data.status;
    if (data.observacao !== undefined) payload.observacao = data.observacao || null;

    const { data: row, error } = await supabaseAdmin
      .from('rastreios' as any)
      .insert(payload as any)
      .select('id, codigo_pedido, status, observacao, ultima_atualizacao, created_at')
      .single();

    if (error) {
      if ((error as any).code === '23505') {
        throw new Error('Já existe um rastreio com esse código');
      }
      console.error('[adminCreateRastreio] erro', error);
      throw new Error('Erro ao criar rastreio');
    }
    return row as unknown as AdminRastreio;
  });

export const adminUpdateRastreio = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(RASTREIO_STATUSES).optional(),
        observacao: z.string().trim().max(2000).nullable().optional(),
        notifyProblema: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<AdminRastreio> => {
    await ensureAdmin();
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.observacao !== undefined) patch.observacao = data.observacao || null;

    const { data: row, error } = await supabaseAdmin
      .from('rastreios' as any)
      .update(patch as any)
      .eq('id', data.id)
      .select('id, codigo_pedido, status, observacao, ultima_atualizacao, created_at')
      .single();

    if (error) {
      console.error('[adminUpdateRastreio] erro', error);
      throw new Error('Erro ao atualizar rastreio');
    }

    const updated = row as unknown as AdminRastreio;
    if (data.notifyProblema && updated.status === PROBLEMA_ENVIO_STATUS) {
      await notifyProblemaEnvio(updated.codigo_pedido);
    }
    return updated;
  });

export const adminBulkUpdateRastreios = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(1000),
        status: z.enum(RASTREIO_STATUSES),
        notifyProblema: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ updated: number; notified?: number }> => {
    await ensureAdmin();
    const { data: rows, error } = await supabaseAdmin
      .from('rastreios' as any)
      .update({ status: data.status } as any)
      .in('id', data.ids)
      .select('id, codigo_pedido');
    if (error) {
      console.error('[adminBulkUpdateRastreios] erro', error);
      throw new Error('Erro ao atualizar rastreios em massa');
    }
    const list = (rows as any[]) || [];
    let notified = 0;
    if (data.notifyProblema && data.status === PROBLEMA_ENVIO_STATUS) {
      for (const r of list) {
        await notifyProblemaEnvio(r.codigo_pedido);
        notified++;
      }
    }
    return { updated: list.length, notified };
  });
