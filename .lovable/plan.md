# Ferramenta admin: Envio retroativo de emails de rastreio

## Objetivo
Página admin protegida que lista pedidos pagos antigos sem email de rastreio enviado, cria registros em `rastreios` e dispara emails via Resend com link `https://casacosmeticos.shop/rastreio/{external_reference}`.

## 1. Banco de dados (migration)
- Adicionar coluna `tracking_email_sent_at TIMESTAMPTZ NULL` na tabela `orders`.
- Índice parcial para acelerar a busca:  
  `CREATE INDEX ON orders (approved_at) WHERE status = 'paid' AND tracking_email_sent_at IS NULL;`

## 2. Novo template de email
Arquivo: `src/lib/email/sendTrackingEmail.server.ts`

- Reaproveita o estilo visual do `sendOrderApprovedEmail.server.ts` (header rosa Casa Cosméticos).
- Conteúdo:
  - Título: "Acompanhe seu pedido 📦"
  - Nome do cliente
  - Código do pedido (`external_reference`)
  - Botão "Acompanhar Pedido" → `https://casacosmeticos.shop/rastreio/{codigo}`
  - Bloco WhatsApp suporte
- Retorna `{ ok, id?, error? }`.

## 3. Server functions admin
Arquivo: `src/lib/admin/tracking-backfill.functions.ts` (reutiliza o gating `ensureAdmin` da sessão `cc_admin_rastreios`).

- `adminListPendingTrackingEmails()` → retorna pedidos onde:
  - `status = 'paid'`
  - `tracking_payload->>email` é email válido
  - `tracking_email_sent_at IS NULL`
  - opcional: `approved_at` mais antigo primeiro  
  Devolve `{ id, external_reference, nome, email, approved_at }[]` + `total`.

- `adminSendTrackingEmailsBatch({ ids: string[] })` → processa um lote (máx 10 ids):
  1. Para cada pedido:
     - "Claim" otimista: `UPDATE orders SET tracking_email_sent_at = now() WHERE id = ? AND tracking_email_sent_at IS NULL` (evita duplicado em concorrência).
     - Se claim falhou → marca `skipped: 'already_sent'`.
     - `upsert` em `rastreios` por `codigo_pedido = external_reference` com status `Pagamento aprovado` (não sobrescreve se já existe).
     - Envia email via `sendTrackingEmail`.
     - Se email falhar → `UPDATE orders SET tracking_email_sent_at = NULL` (rollback) e devolve erro.
  2. Retorna `{ results: Array<{ id, ok, error?, skipped? }> }`.

## 4. Página admin
Arquivo: `src/routes/admin/rastreamento-retroativo.tsx`

Layout simples seguindo o padrão de `src/routes/admin/rastreios.tsx`:
- Verifica admin via `adminCheck`; se não logado redireciona para a tela de login admin existente.
- Card topo: "X pedidos pendentes de email de rastreio" + botão **"Recarregar"**.
- Tabela com: código, nome, email, data aprovação, status do envio.
- Botão grande **"Enviar emails"** (desabilita durante envio).
- Ao clicar:
  - Divide IDs em lotes de 10.
  - Loop sequencial chamando `adminSendTrackingEmailsBatch` por lote.
  - Atualiza barra de progresso (`Progress` do shadcn) e contadores: enviados / erros / pulados.
  - Exibe log em tempo real (lista rolável) com ✅ / ❌ / ⏭ por pedido.
- Toast final com resumo.

## 5. Garantias / regras
- **Sem duplicado**: claim atômico via `tracking_email_sent_at` + filtro `IS NULL`.
- **Lotes**: 10 pedidos por requisição, sequencial no client para não sobrecarregar Resend.
- **Logs servidor**: `[tracking-backfill]` em cada etapa (claim, upsert rastreio, envio, erro).
- **Idempotente**: rodar de novo só pega quem ainda não tem `tracking_email_sent_at`.
- **Email inválido**: filtrado no SELECT (regex `~* '^[^@]+@[^@]+\.[^@]+$'`).

## Arquivos a criar / editar
- `supabase/migrations/...add_tracking_email_sent_at.sql` (nova coluna + índice)
- `src/lib/email/sendTrackingEmail.server.ts` (novo)
- `src/lib/admin/tracking-backfill.functions.ts` (novo)
- `src/routes/admin/rastreamento-retroativo.tsx` (nova rota)

## Fora de escopo
- Não altera fluxo do webhook `efi-pago`.
- Não altera `sendOrderApprovedEmail` nem o email de pagamento aprovado.
- Não envia para pedidos não pagos.
