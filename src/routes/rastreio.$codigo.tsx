import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Package, Truck, MapPin, Home, ClipboardCheck, CreditCard, Loader2 } from 'lucide-react';
import { getOrCreateRastreio } from '@/lib/rastreios/public.functions';
import { RASTREIO_STATUSES } from '@/lib/rastreios/statuses';

export const Route = createFileRoute('/rastreio/$codigo')({
  head: ({ params }) => ({
    meta: [
      { title: `Rastreio do pedido ${params.codigo} — Eletros Jundiaí` },
      { name: 'description', content: 'Acompanhe o status do seu pedido na Eletros Jundiaí.' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: RastreioPage,
});

const WHATSAPP_URL = 'https://wa.me/5511999999999';

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Pedido gerado': ClipboardCheck,
  'Pagamento aprovado': CreditCard,
  'Pedido em separação': Package,
  'Objeto postado': Package,
  'Em transporte': Truck,
  'Saiu para entrega': MapPin,
  'Entregue': Home,
};

function RastreioPage() {
  const { codigo } = Route.useParams();
  const fetchRastreio = useServerFn(getOrCreateRastreio);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['rastreio', codigo],
    queryFn: () => fetchRastreio({ data: { codigo } }),
    staleTime: 30_000,
  });

  const currentStatus = data?.status || 'Pagamento aprovado';
  const currentIdx = RASTREIO_STATUSES.indexOf(currentStatus as any);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-pink-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
            Acompanhe seu pedido
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Atualizamos o status conforme seu pedido avança.
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-lg border border-pink-100 overflow-hidden">
          <div className="bg-gradient-to-r from-[#c83f70] to-[#e85a8a] p-6 text-white">
            <div className="text-xs uppercase tracking-wider opacity-90">Código do pedido</div>
            <div className="font-mono text-base sm:text-lg font-semibold mt-1 break-all">
              {codigo}
            </div>
            <div className="mt-4 inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-medium">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isLoading ? 'Carregando...' : currentStatus}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {isError && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                Não foi possível carregar o status agora. Tente novamente em instantes.
              </div>
            )}

            {data?.observacao && (
              <div className="mb-6 p-4 bg-pink-50 border border-pink-100 rounded-lg">
                <div className="text-xs uppercase tracking-wider text-[#c83f70] font-semibold mb-1">Observação</div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{data.observacao}</p>
              </div>
            )}

            <h2 className="font-semibold text-gray-900 mb-6">Linha do tempo</h2>
            <ol className="relative">
              {RASTREIO_STATUSES.map((label, i) => {
                const Icon = STEP_ICONS[label] || Package;
                const done = currentIdx >= 0 && i <= currentIdx;
                const isCurrent = i === currentIdx;
                const isLast = i === RASTREIO_STATUSES.length - 1;
                const nextDone = currentIdx >= 0 && i + 1 <= currentIdx;
                return (
                  <li key={label} className="relative pl-12 pb-6 last:pb-0">
                    {!isLast && (
                      <span
                        className={`absolute left-[18px] top-9 bottom-0 w-0.5 ${
                          nextDone ? 'bg-[#c83f70]' : 'bg-gray-200'
                        }`}
                      />
                    )}
                    <span
                      className={`absolute left-0 top-0 flex items-center justify-center w-9 h-9 rounded-full border-2 ${
                        done
                          ? 'bg-[#c83f70] border-[#c83f70] text-white'
                          : 'bg-white border-gray-300 text-gray-400'
                      } ${isCurrent ? 'ring-4 ring-pink-200' : ''}`}
                    >
                      {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                    </span>
                    <div className="pt-1">
                      <div className={`font-medium ${done ? 'text-gray-900' : 'text-gray-500'}`}>
                        {label}
                      </div>
                      {isCurrent && (
                        <div className="text-xs text-[#c83f70] mt-0.5 font-medium">
                          Status atual
                        </div>
                      )}
                      {done && !isCurrent && (
                        <div className="text-xs text-[#c83f70] mt-0.5 font-medium">Concluído</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {data?.ultima_atualizacao && (
              <p className="text-xs text-gray-400 mt-4 text-center">
                Última atualização: {new Date(data.ultima_atualizacao).toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          <div className="bg-gray-50 border-t border-gray-100 p-6 text-center">
            <p className="text-sm text-gray-600 mb-3">
              Dúvidas sobre seu pedido? Fale com nosso suporte.
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1fb957] transition-colors text-white font-semibold px-6 py-3 rounded-lg text-sm shadow-sm"
            >
              💬 Falar no WhatsApp
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © {new Date().getFullYear()} Eletros Jundiaí
        </p>
      </div>
    </div>
  );
}
