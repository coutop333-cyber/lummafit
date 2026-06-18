import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Check, QrCode, Truck, Shield, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { getKorvexPaymentStatus } from '@/lib/korvex.functions';
import { useMetaPixel } from '@/hooks/useMetaPixel';
import type { PixPaymentInfo } from './PixCheckoutDialog';
import pixLogo from '@/assets/pix-logo.png';

export interface OrderProduct {
  image: string;
  title: string;
  variation: string;
  quantity: number;
  unitPrice: number;
  price: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: OrderProduct | null;
  onPay: () => Promise<PixPaymentInfo | null>;
  onApproved?: (payment: PixPaymentInfo) => void;
  title?: string;
  description?: string;
  primaryColor?: string;
  accentColor?: string;
  headerEyebrow?: string;
  payButtonLabel?: (total: string) => string;
  onShippingChange?: (cost: number) => void;
}

export function OrderReviewDialog({
  open,
  onOpenChange,
  product,
  onPay,
  onApproved,
  title = 'Revise seu pedido',
  description = 'Confira os itens e finalize com Pix.',
  primaryColor = '#0c2340',
  accentColor,
  headerEyebrow,
  payButtonLabel,
  onShippingChange,
}: Props) {
  const primary = primaryColor;
  const [generating, setGenerating] = useState(false);
  const [payment, setPayment] = useState<PixPaymentInfo | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [copied, setCopied] = useState(false);
  const getStatus = useServerFn(getKorvexPaymentStatus);
  const { trackAddPaymentInfo } = useMetaPixel();
  const firedRef = useRef(false);
  const addPaymentInfoFiredRef = useRef(false);
  const [shipping, setShipping] = useState<'gratis' | 'expresso'>('gratis');
  const shippingCost = shipping === 'expresso' ? 16.9 : 0;
  const handleShippingChange = (v: 'gratis' | 'expresso') => {
    setShipping(v);
    onShippingChange?.(v === 'expresso' ? 16.9 : 0);
  };

  useEffect(() => {
    if (open) {
      // reset ao reabrir para uma nova compra
      setPayment(null);
      setStatus('pending');
      setCopied(false);
      firedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!payment) return;
    if (status === 'approved' || status === 'rejected' || status === 'cancelled') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await getStatus({ data: { txid: String(payment.txid || payment.id) } });
        if (cancelled) return;
        setStatus(r.status);
        if (r.status === 'approved' && !firedRef.current) {
          firedRef.current = true;
          onApproved?.(payment);
        }
      } catch (err) {
        console.error('poll status', err);
      }
    };
    // Primeira checagem imediata, depois a cada 2 segundos
    void tick();
    const t = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [payment, status, getStatus, onApproved]);

  const handlePay = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const p = await onPay();
      if (p) {
        setPayment(p);
        setStatus(p.status || 'pending');
        // AddPaymentInfo — dispara quando QR Code aparece (sinal forte de intenção)
        if (!addPaymentInfoFiredRef.current && product) {
          addPaymentInfoFiredRef.current = true;
          trackAddPaymentInfo({
            content_name: product.title,
            content_ids: [p.txid || p.id],
            value: total,
            currency: 'BRL',
            num_items: 1,
            event_id: p.external_reference,
          });
        }
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!payment?.qr_code) return;
    try {
      await navigator.clipboard.writeText(payment.qr_code);
      setCopied(true);
      toast.success('Código Pix copiado!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const isApproved = status === 'approved';
  const isFailed = status === 'rejected' || status === 'cancelled';
  const total = (product?.price ?? 0) + shippingCost;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0" style={accentColor ? { borderTop: `5px solid ${accentColor}` } : undefined}>
        <DialogHeader className="px-6 pt-6">
          {headerEyebrow && (
            <span
              className="inline-block self-start text-[10px] font-extrabold uppercase tracking-widest px-2 py-1 rounded-md mb-1"
              style={{ backgroundColor: accentColor || primary, color: accentColor ? primary : '#ffffff' }}
            >
              {headerEyebrow}
            </span>
          )}
          <DialogTitle className="text-2xl font-bold" style={{ fontFamily: 'Archivo Black, sans-serif', color: primary }}>
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {!product ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: primary }} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* LADO ESQUERDO: Resumo do pedido */}
            <div className="p-6 border-r bg-gray-50/60 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Resumo do pedido</h3>

              <div className="bg-white rounded-xl border p-3 flex gap-3">
                <img
                  src={product.image}
                  alt={product.title}
                  className="w-20 h-20 rounded-lg object-cover bg-gray-100 shrink-0"
                  width={80}
                  height={80}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{product.title}</p>
                  <p className="text-xs text-gray-600 mt-1">Variação: {product.variation}</p>
                  <p className="text-xs text-gray-600">Quantidade: {product.quantity}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: primary }}>
                    R$ {product.price.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>

              {/* Opções de frete */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Frete</h4>

                <button
                  type="button"
                  onClick={() => handleShippingChange('gratis')}
                  className="w-full text-left rounded-xl border-2 p-3 bg-white transition flex items-center gap-3 hover:border-gray-300"
                  style={{ borderColor: shipping === 'gratis' ? primary : '#e5e7eb' }}
                >
                  <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-gray-900">Frete grátis</p>
                      <span className="text-sm font-bold text-green-600">Grátis</span>
                    </div>
                    <p className="text-[11px] text-gray-600">Receba em até 7 dias úteis</p>
                  </div>
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: shipping === 'gratis' ? primary : '#d1d5db' }}>
                    {shipping === 'gratis' && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: primary }} />}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleShippingChange('expresso')}
                  className="w-full text-left rounded-xl border-2 p-3 bg-white transition flex items-center gap-3 hover:border-gray-300"
                  style={{ borderColor: shipping === 'expresso' ? primary : '#e5e7eb' }}
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <Zap className="w-5 h-5 text-emerald-600 fill-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-bold text-gray-900">Frete expresso</p>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wide">
                          <Zap className="w-2.5 h-2.5 fill-white" /> Full
                        </span>
                      </div>
                      <span className="text-sm font-bold text-gray-900 whitespace-nowrap">R$ 16,90</span>
                    </div>
                    <p className="text-[11px] text-gray-600">Receba em 1-2 dias úteis</p>
                  </div>
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: shipping === 'expresso' ? primary : '#d1d5db' }}>
                    {shipping === 'expresso' && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: primary }} />}
                  </div>
                </button>
              </div>

              <div className="bg-white rounded-xl border divide-y">
                <div className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium text-gray-900">R$ {product.price.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <Truck className="w-4 h-4 text-green-600" /> Frete
                  </span>
                  {shippingCost === 0 ? (
                    <span className="font-semibold text-green-600">Grátis</span>
                  ) : (
                    <span className="font-semibold text-gray-900">R$ {shippingCost.toFixed(2).replace('.', ',')}</span>
                  )}
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-base font-semibold text-gray-900">Total</span>
                  <span className="text-xl font-bold" style={{ color: primary }}>
                    R$ {total.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Shield className="w-3.5 h-3.5" />
                <span>Pagamento processado com segurança via Pix</span>
              </div>
            </div>

            {/* LADO DIREITO: Pagamento */}
            <div className="p-6 space-y-4">
              {!payment ? (
                <>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Escolha a forma de pagamento
                  </h3>

                  <div
                    className="rounded-xl border-2 p-4 bg-white"
                    style={{ borderColor: primary }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-white border flex items-center justify-center shrink-0">
                        <img src={pixLogo} alt="Pix" className="w-9 h-9 object-contain" width={36} height={36} loading="lazy" decoding="async" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">Pix</p>
                        <p className="text-xs text-gray-600">Aprovação imediata</p>
                      </div>
                      <div
                        className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                        style={{ borderColor: primary }}
                      >
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: primary }} />
                      </div>
                    </div>

                    <ul className="mt-3 space-y-1.5 text-xs text-gray-600">
                      <li className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-green-600" /> Aprovado na hora</li>
                      <li className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-green-600" /> Pagamento 100% seguro</li>
                      <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-green-600" /> Sem taxas adicionais</li>
                    </ul>
                  </div>

                  <Button
                    onClick={handlePay}
                    disabled={generating}
                    className="w-full py-6 text-base font-bold uppercase tracking-wide"
                    style={{ backgroundColor: primary }}
                  >
                    {generating ? (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Gerando Pix...</>
                    ) : payButtonLabel ? (
                      payButtonLabel(total.toFixed(2).replace('.', ','))
                    ) : (
                      <>Pagar R$ {total.toFixed(2).replace('.', ',')} com Pix</>
                    )}
                  </Button>

                  <p className="text-[11px] text-gray-500 text-center">
                    Ao continuar você concorda com nossos termos de compra.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                    <QrCode className="w-4 h-4" style={{ color: primary }} />
                    Pague com Pix
                  </h3>

                  <div className="bg-white border rounded-xl p-4 flex items-center justify-center">
                    {payment.qr_code_base64 ? (
                      <img
                        src={`data:image/png;base64,${payment.qr_code_base64}`}
                        alt="QR Code Pix"
                        className="w-52 h-52 object-contain"
                        width={208}
                        height={208}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground">QR indisponível</div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Pix copia e cola
                    </label>
                    <div className="mt-1 bg-gray-50 border rounded-lg p-3 text-[11px] break-all font-mono text-gray-800 max-h-24 overflow-y-auto">
                      {payment.qr_code}
                    </div>
                  </div>

                  <Button
                    onClick={handleCopy}
                    className="w-full py-5 text-sm font-bold uppercase tracking-wide"
                    style={{ backgroundColor: primary }}
                  >
                    {copied ? (<><Check className="w-4 h-4 mr-2" />Código copiado</>) : (<><Copy className="w-4 h-4 mr-2" />Copiar código Pix</>)}
                  </Button>

                  <div
                    className={`rounded-lg px-4 py-3 text-sm font-medium text-center ${
                      isApproved
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : isFailed
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {isApproved ? (
                      <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" />Pagamento confirmado</span>
                    ) : isFailed ? (
                      'Pagamento não concluído'
                    ) : (
                      <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Aguardando pagamento…</span>
                    )}
                  </div>

                  {payment.txid && (
                    <p className="text-[10px] text-gray-400 text-center font-mono break-all">
                      txid: {payment.txid}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
