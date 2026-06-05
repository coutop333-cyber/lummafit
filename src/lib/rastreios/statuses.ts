export const RASTREIO_STATUSES = [
  'Pedido gerado',
  'Pagamento aprovado',
  'Pedido em separação',
  'Objeto postado',
  'Em transporte',
  'Saiu para entrega',
  'Entregue',
  'Problemas com envio, verifique seu e-mail',
] as const;

export type RastreioStatus = (typeof RASTREIO_STATUSES)[number];

export const DEFAULT_RASTREIO_STATUS: RastreioStatus = 'Pagamento aprovado';

export const PROBLEMA_ENVIO_STATUS: RastreioStatus =
  'Problemas com envio, verifique seu e-mail';
