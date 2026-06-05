import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Check, Mail, Inbox, ShieldAlert, Tag, ExternalLink, Package, Trophy, Truck, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { z } from 'zod';

const VERDE = '#009c3b';
const VERDE_ESCURO = '#00802f';
const AMARELO = '#ffdf00';
const AZUL = '#002776';

const searchSchema = z.object({
  ref: z.string().optional(),
  id: z.string().optional(),
  value: z.coerce.number().optional(),
  product: z.string().optional(),
  status: z.string().optional(),
});

export const Route = createFileRoute('/obrigado')({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: 'Pedido Confirmado — Copa das Figurinhas' },
      { name: 'description', content: 'Seu pedido foi confirmado. Obrigado pela compra!' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ObrigadoPage,
});

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function ObrigadoPage() {
  const { ref, id, value, product, status } = Route.useSearch();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (status && status !== 'approved') {
      navigate({ to: '/', replace: true });
    }
  }, [status, navigate]);

  useEffect(() => { setMounted(true); }, []);

  const valorBR =
    typeof value === 'number' && Number.isFinite(value)
      ? value.toFixed(2).replace('.', ',')
      : null;

  const handleAbrirEmail = () => {
    if (isMobile()) {
      window.location.href = 'mailto:';
    } else {
      window.open('https://mail.google.com/mail/u/0/#inbox', '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <main className="min-h-screen px-4 py-8" style={{ background: '#f0faf0', fontFamily: 'Archivo Black, sans-serif' }}>

      {/* Header */}
      <div className="text-center mb-6">
        <span className="text-3xl font-black" style={{ fontFamily: 'Archivo Black, sans-serif', color: '#111' }}>
          Lumma <span style={{ color: '#d63384' }}>FIT</span>
        </span>
      </div>

      <div className="mx-auto w-full max-w-lg">

        {/* Card principal */}
        <section
          className={`bg-white rounded-3xl shadow-xl overflow-hidden transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ border: `3px solid ${VERDE}` }}
        >
          {/* Faixa topo */}
          <div className="py-4 px-6 text-center" style={{ background: `linear-gradient(135deg, ${VERDE}, ${VERDE_ESCURO})` }}>
            <div className="relative mx-auto mb-3 flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 rounded-full opacity-40 animate-ping" style={{ backgroundColor: AMARELO }} />
              <span className="absolute inset-0 rounded-full" style={{ backgroundColor: `${AMARELO}66` }} />
              <Check className="relative h-9 w-9" strokeWidth={3} style={{ color: AZUL }} />
            </div>
            <p className="text-xs uppercase tracking-[0.2em] font-bold text-white/80 mb-1">
              🇧🇷 Compra confirmada
            </p>
            <h1 className="text-2xl font-black text-white leading-tight">
              Pagamento aprovado com sucesso!
            </h1>
            {valorBR && (
              <p className="mt-1 text-3xl font-black" style={{ color: AMARELO }}>
                R$ {valorBR}
              </p>
            )}
          </div>

          <div className="p-6 space-y-5">

            {/* Próximos passos */}
            <div className="rounded-2xl p-4" style={{ background: `${VERDE}0d`, border: `1.5px solid ${VERDE}30` }}>
              <p className="font-black text-sm uppercase mb-3" style={{ color: VERDE }}>
                🏆 O que acontece agora?
              </p>
              <ul className="space-y-3">
                {[
                  { icon: Check, text: 'Seu pagamento foi confirmado instantaneamente', done: true },
                  { icon: Package, text: 'Seu kit está sendo separado para envio', done: true },
                  { icon: Truck, text: 'Você receberá o código de rastreio por email', done: false },
                  { icon: Star, text: 'Entrega em 3 a 7 dias úteis', done: false },
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: item.done ? VERDE : '#e5e7eb' }}>
                      <item.icon className="h-3.5 w-3.5" style={{ color: item.done ? '#fff' : '#9ca3af' }} strokeWidth={3} />
                    </div>
                    <span className={item.done ? 'font-semibold text-gray-900' : ''}>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Email */}
            <div className="rounded-2xl p-5 border-2" style={{ background: `linear-gradient(135deg, ${AZUL}08, white)`, borderColor: `${AZUL}30` }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0 text-white" style={{ backgroundColor: AZUL }}>
                  <Mail className="h-6 w-6" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="font-black text-base text-gray-900">📩 Confirme seu email</h2>
                  <p className="text-xs text-gray-500">Código de rastreio e confirmação</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 mb-3">
                Enviamos a <strong>confirmação da compra</strong> e o <strong>código de rastreio</strong> para seu email. Verifique:
              </p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { icon: Inbox, label: 'Caixa de entrada' },
                  { icon: ShieldAlert, label: 'Spam' },
                  { icon: Tag, label: 'Promoções' },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center gap-1 rounded-xl bg-white border border-gray-100 px-2 py-3 text-center">
                    <item.icon className="h-5 w-5" style={{ color: AZUL }} />
                    <span className="text-[10px] font-medium text-gray-700 leading-tight">{item.label}</span>
                  </div>
                ))}
              </div>
              <Button
                onClick={handleAbrirEmail}
                className="w-full py-5 text-sm font-black uppercase tracking-wide text-white"
                style={{ backgroundColor: AZUL, fontFamily: 'Archivo Black, sans-serif' }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir meu email
              </Button>
            </div>

            {/* Detalhes do pedido */}
            {(product || valorBR || ref) && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-3">
                  Detalhes do pedido
                </p>
                <div className="space-y-2">
                  {product && (
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-gray-500">Produto</span>
                      <span className="font-semibold text-gray-900 text-right text-xs max-w-[60%]">{product}</span>
                    </div>
                  )}
                  {valorBR && (
                    <div className="flex justify-between gap-3 text-sm border-t border-gray-200 pt-2">
                      <span className="text-gray-500">Valor pago</span>
                      <span className="font-black" style={{ color: VERDE }}>R$ {valorBR}</span>
                    </div>
                  )}
                  {ref && (
                    <div className="flex justify-between gap-3 text-xs border-t border-gray-200 pt-2">
                      <span className="text-gray-500">Pedido</span>
                      <span className="font-mono break-all text-right text-gray-600 max-w-[60%]">{ref.slice(0, 30)}...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rastrear pedido */}
            {ref && (
              <Button
                asChild
                variant="outline"
                className="w-full py-5 text-sm font-black uppercase border-2"
                style={{ borderColor: VERDE, color: VERDE, fontFamily: 'Archivo Black, sans-serif' }}
              >
                <Link to="/rastreio/$codigo" params={{ codigo: ref }}>
                  <Package className="mr-2 h-4 w-4" />
                  Rastrear meu pedido
                </Link>
              </Button>
            )}

            {/* CTA voltar */}
            <div className="text-center pt-2">
              <Link
                to="/"
                className="text-sm font-semibold transition-colors hover:underline"
                style={{ color: VERDE }}
              >
                ← Voltar à loja
              </Link>
            </div>

          </div>
        </section>

        <p className="mt-5 text-center text-xs text-gray-400">
          🔒 Compra 100% segura · Copa das Figurinhas · Produto oficial Panini
        </p>
      </div>
    </main>
  );
}
