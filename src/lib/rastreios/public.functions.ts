import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { DEFAULT_RASTREIO_STATUS } from './statuses';

export interface PublicRastreio {
  codigo_pedido: string;
  status: string;
  observacao: string | null;
  ultima_atualizacao: string;
  created_at: string;
}

export const getOrCreateRastreio = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({ codigo: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }): Promise<PublicRastreio> => {
    const codigo = data.codigo;

    const { data: existing, error: findErr } = await supabaseAdmin
      .from('rastreios' as any)
      .select('codigo_pedido, status, observacao, ultima_atualizacao, created_at')
      .eq('codigo_pedido', codigo)
      .maybeSingle();

    if (findErr) {
      console.error('[getOrCreateRastreio] erro ao buscar', findErr);
      throw new Error('Erro ao buscar rastreio');
    }

    if (existing) return existing as unknown as PublicRastreio;

    const { data: created, error: insErr } = await supabaseAdmin
      .from('rastreios' as any)
      .insert({ codigo_pedido: codigo, status: DEFAULT_RASTREIO_STATUS } as any)
      .select('codigo_pedido, status, observacao, ultima_atualizacao, created_at')
      .single();

    if (insErr) {
      // race: outra requisição criou — relê
      const { data: again } = await supabaseAdmin
        .from('rastreios' as any)
        .select('codigo_pedido, status, observacao, ultima_atualizacao, created_at')
        .eq('codigo_pedido', codigo)
        .maybeSingle();
      if (again) return again as unknown as PublicRastreio;
      console.error('[getOrCreateRastreio] erro ao criar', insErr);
      throw new Error('Erro ao criar rastreio');
    }

    return created as unknown as PublicRastreio;
  });
