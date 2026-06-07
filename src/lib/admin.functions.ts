import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendTrackingEmail } from '@/lib/email/sendTrackingEmail.server';

const ADMIN_PASSWORD = '1234';

function checkPassword(senha: string) {
  if (senha !== ADMIN_PASSWORD) throw new Error('Senha incorreta');
}

// ============ Buscar todos os pedidos ============
export const adminListOrders = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({
      senha: z.string(),
      data: z.string().optional(),
      status: z.string().optional(),
      page: z.number().int().min(1).default(1),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    checkPassword(data.senha);

    let query = supabaseAdmin
      .from('orders')
      .select('id, external_reference, status, amount, kit_title, approved_at, created_at, tracking_payload, order_email_sent_at, tracking_email_sent_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (data.status) query = query.eq('status', data.status);

    if (data.data) {
      const start = `${data.data}T00:00:00.000Z`;
      const end = `${data.data}T23:59:59.999Z`;
      query = (query as any).gte('created_at', start).lte('created_at', end);
    }

    const { data: orders, error } = await query;
    if (error) throw new Error('Erro ao buscar pedidos');
    return orders || [];
  });

// ============ Buscar rastreio de um pedido ============
export const adminGetRastreio = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({ senha: z.string(), codigo_pedido: z.string() }).parse(input)
  )
  .handler(async ({ data }) => {
    checkPassword(data.senha);
    const { data: rastreio } = await supabaseAdmin
      .from('rastreios' as any)
      .select('*')
      .eq('codigo_pedido', data.codigo_pedido)
      .maybeSingle();
    return rastreio || null;
  });

// ============ Salvar/Atualizar rastreio de um pedido ============
export const adminSaveRastreio = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({
      senha: z.string(),
      codigo_pedido: z.string(),
      status: z.string().min(2).max(200),
      observacao: z.string().max(500).optional(),
      codigo_rastreio: z.string().max(50).optional(),
      enviar_email: z.boolean().default(false),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    checkPassword(data.senha);

    const { error } = await supabaseAdmin
      .from('rastreios' as any)
      .upsert({
        codigo_pedido: data.codigo_pedido,
        status: data.status,
        observacao: data.observacao || '',
        codigo_rastreio: data.codigo_rastreio || null,
        ultima_atualizacao: new Date().toISOString(),
        site: 'lummafit',
      } as any, { onConflict: 'codigo_pedido' });

    if (error) throw new Error('Erro ao salvar rastreio');

    // Enviar email se solicitado
    if (data.enviar_email) {
      try {
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('tracking_payload, tracking_email_sent_at')
          .eq('external_reference', data.codigo_pedido)
          .maybeSingle();

        const tp = (order as any)?.tracking_payload || {};
        const email = tp.email;
        const nome = tp.name || tp.nome || '';

        if (email) {
          const result = await sendTrackingEmail({
            nomeCliente: nome,
            emailCliente: email,
            codigoPedido: data.codigo_pedido,
            statusAtual: data.status,
            observacao: data.observacao,
            codigoRastreio: data.codigo_rastreio,
            linkRastreio: `https://lummafit.com/rastreio/${data.codigo_pedido}`,
          });

          if (result.ok) {
            await supabaseAdmin
              .from('orders')
              .update({ tracking_email_sent_at: new Date().toISOString() } as any)
              .eq('external_reference', data.codigo_pedido);
          }

          return { ok: true, email_sent: result.ok, email_error: result.error };
        }
      } catch (err) {
        console.error('[adminSaveRastreio] email error', err);
        return { ok: true, email_sent: false, email_error: String(err) };
      }
    }

    return { ok: true, email_sent: false };
  });

// ============ Atualizar rastreio de todos os pedidos de uma data ============
export const adminBulkUpdateRastreio = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({
      senha: z.string(),
      data: z.string(), // YYYY-MM-DD
      status: z.string().min(2).max(200),
      observacao: z.string().max(500).optional(),
      codigo_rastreio: z.string().max(50).optional(),
      enviar_email: z.boolean().default(false),
      apenas_pagos: z.boolean().default(true),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    checkPassword(data.senha);

    const start = `${data.data}T00:00:00.000Z`;
    const end = `${data.data}T23:59:59.999Z`;

    let query = supabaseAdmin
      .from('orders')
      .select('id, external_reference, tracking_payload')
      .gte('created_at', start)
      .lte('created_at', end);

    if (data.apenas_pagos) query = query.eq('status', 'paid');

    const { data: orders, error } = await query;
    if (error) throw new Error('Erro ao buscar pedidos da data');

    if (!orders || orders.length === 0) return { ok: true, updated: 0, emails: 0 };

    let updated = 0;
    let emails = 0;

    for (const order of orders) {
      const codigo = order.external_reference;

      await supabaseAdmin
        .from('rastreios' as any)
        .upsert({
          codigo_pedido: codigo,
          status: data.status,
          observacao: data.observacao || '',
          codigo_rastreio: data.codigo_rastreio || null,
          ultima_atualizacao: new Date().toISOString(),
          site: 'lummafit',
        } as any, { onConflict: 'codigo_pedido' });

      updated++;

      if (data.enviar_email) {
        try {
          const tp = (order as any).tracking_payload || {};
          const email = tp.email;
          const nome = tp.name || tp.nome || '';

          if (email) {
            const result = await sendTrackingEmail({
              nomeCliente: nome,
              emailCliente: email,
              codigoPedido: codigo,
              statusAtual: data.status,
              observacao: data.observacao,
              codigoRastreio: data.codigo_rastreio,
              linkRastreio: `https://lummafit.com/rastreio/${codigo}`,
            });
            if (result.ok) {
              emails++;
              await supabaseAdmin
                .from('orders')
                .update({ tracking_email_sent_at: new Date().toISOString() } as any)
                .eq('external_reference', codigo);
            }
          }
        } catch (err) {
          console.error('[adminBulkUpdate] email error', order.external_reference, err);
        }
      }
    }

    return { ok: true, updated, emails };
  });

// ============ Buscar rastreio público (para o cliente) ============
export const getPublicRastreio = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({ codigo: z.string().min(4).max(120) }).parse(input)
  )
  .handler(async ({ data }) => {
    const { data: rastreio } = await supabaseAdmin
      .from('rastreios' as any)
      .select('status, observacao, codigo_rastreio, ultima_atualizacao, created_at')
      .eq('codigo_pedido', data.codigo)
      .maybeSingle();

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('status, amount, kit_title, approved_at, tracking_payload')
      .eq('external_reference', data.codigo)
      .maybeSingle();

    if (!order) return null;

    const tp = (order as any)?.tracking_payload || {};

    return {
      codigo: data.codigo,
      order_status: order.status,
      amount: order.amount,
      kit_title: order.kit_title,
      approved_at: order.approved_at,
      nome_cliente: tp.name || tp.nome || null,
      rastreio_status: (rastreio as any)?.status || null,
      rastreio_observacao: (rastreio as any)?.observacao || null,
      rastreio_codigo: (rastreio as any)?.codigo_rastreio || null,
      rastreio_atualizado: (rastreio as any)?.ultima_atualizacao || null,
    };
  });
