import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Check, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { getKorvexPaymentStatus } from '@/lib/korvex.functions';

export interface PixPaymentInfo {
  id: string | number;
  txid?: string;
  status: string;
  qr_code: string;
  qr_code_base64: string;
  ticket_url: string;
  external_reference: string;
  transaction_amount: number;
  expires_at?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: PixPaymentInfo | null;
  onApproved?: (payment: PixPaymentInfo) => void;
}

export function PixCheckoutDialog({ open, onOpenChange, payment, onApproved }: Props) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string>(payment?.status ?? 'pending');
  const getStatus = useServerFn(getKorvexPaymentStatus);
  const firedRef = useRef(false);

  useEffect(() => {
    if (payment) setStatus(payment.status);
    firedRef.current = false;
  }, [payment?.id]);

  // Polling de status enquanto não estiver aprovado/rejeitado
  useEffect(() => {
    if (!open || !payment) return;
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
    const t = setInterval(tick, 3500);
    return () => { cancelled = true; clearInterval(t); };
  }, [open, payment, status, getStatus, onApproved]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'Archivo Black, sans-serif' }}>
            <QrCode className="w-6 h-6" style={{ color: '#0c2340' }} />
            Pague com Pix
          </DialogTitle>
          <DialogDescription>
            {isApproved
              ? 'Pagamento aprovado! Obrigada pela compra.'
              : isFailed
              ? 'O pagamento foi recusado ou cancelado.'
              : 'Escaneie o QR Code abaixo ou use o Pix copia e cola.'}
          </DialogDescription>
        </DialogHeader>

        {!payment ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#0c2340' }} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white border rounded-xl p-4 flex items-center justify-center">
              {payment.qr_code_base64 ? (
                <img
                  src={`data:image/png;base64,${payment.qr_code_base64}`}
                  alt="QR Code Pix"
                  className="w-56 h-56 object-contain"
                  width={224}
                  height={224}
                />
              ) : (
                <div className="text-sm text-muted-foreground">QR indisponível</div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Pix copia e cola</label>
              <div className="mt-1 bg-gray-50 border rounded-lg p-3 text-[11px] break-all font-mono text-gray-800 max-h-28 overflow-y-auto">
                {payment.qr_code}
              </div>
            </div>

            <Button
              onClick={handleCopy}
              className="w-full py-6 text-base font-bold uppercase tracking-wide"
              style={{ backgroundColor: '#0c2340' }}
            >
              {copied ? (<><Check className="w-5 h-5 mr-2" />Código copiado</>) : (<><Copy className="w-5 h-5 mr-2" />Copiar código Pix</>)}
            </Button>

            <div className={`rounded-lg px-4 py-3 text-sm font-medium text-center ${
              isApproved
                ? 'bg-green-50 text-green-700 border border-green-200'
                : isFailed
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {isApproved ? (
                <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" />Pagamento confirmado</span>
              ) : isFailed ? (
                'Pagamento não concluído'
              ) : (
                <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Aguardando pagamento…</span>
              )}
            </div>

            <p className="text-xs text-gray-500 text-center">
              Total: <strong>R$ {payment.transaction_amount.toFixed(2).replace('.', ',')}</strong> · ID #{payment.id}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
