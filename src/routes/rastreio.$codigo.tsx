import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getPublicRastreio } from '@/lib/admin.functions';
import { Package, Truck, CheckCircle, Clock, Search, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/rastreio/$codigo')({
  head: () => ({
    meta: [
      { title: 'Rastrear Pedido — Lumma FIT' },
      { name: 'description', content: 'Acompanhe o status do seu pedido Lumma FIT.' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: RastreioPage,
});

function StatusIcon({ status }: { status: string | null }) {
  if (!status) return <Clock className="w-6 h-6 text-gray-400" />;
  const s = status.toLowerCase();
  if (s.includes('entregue')) return <CheckCircle className="w-6 h-6 text-green-500" />;
  if (s.includes('trânsito') || s.includes('saiu') || s.includes('postado')) return <Truck className="w-6 h-6 text-blue-500" />;
  return <Package className="w-6 h-6 text-indigo-400" />;
}

function RastreioPage() {
  const { codigo } = Route.useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busca, setBusca] = useState('');

  const getRastreio = useServerFn(getPublicRastreio);

  const buscarPedido = async (cod: string) => {
    if (!cod || cod.length < 4) return;
    setLoading(true);
    setNotFound(false);
    try {
      const result = await getRastreio({ data: { codigo: cod.trim() } });
      if (!result) { setNotFound(true); setData(null); }
      else setData(result);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (codigo) buscarPedido(codigo);
  }, [codigo]);

  const isPaid = data?.order_status === 'paid' || data?.order_status === 'approved';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 py-5 px-4 text-center">
        <h1 className="text-xl font-black text-white tracking-wide">LUMMA FIT</h1>
        <p className="text-xs text-gray-400 mt-0.5">Rastreamento de Pedido</p>
      </div>

      <div className="flex-1 max-w-xl mx-auto w-full px-4 py-8 space-y-5">

        {/* Busca por outro código */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-500" /> Buscar pedido por código
          </p>
          <div className="flex gap-2">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarPedido(busca)}
              placeholder="Cole o código do seu pedido"
              className="flex-1 text-sm"
            />
            <Button onClick={() => buscarPedido(busca)} className="bg-gray-900 text-white">
              Buscar
            </Button>
          </div>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-gray-500">Buscando seu pedido...</p>
          </div>
        )}

        {notFound && !loading && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-red-100 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6 text-red-500" />
            </div>
            <p className="font-semibold text-gray-800">Pedido não encontrado</p>
            <p className="text-sm text-gray-500 mt-1">Verifique o código e tente novamente.</p>
          </div>
        )}

        {data && !loading && (
          <>
            {/* Informações do pedido */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-400 font-mono">{codigo}</p>
                  <p className="font-bold text-gray-900 mt-0.5">{data.kit_title || 'Produto'}</p>
                  {data.nome_cliente && (
                    <p className="text-sm text-gray-500 mt-0.5">Olá, {data.nome_cliente.split(' ')[0]}!</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {isPaid ? '✓ Pago' : 'Pendente'}
                  </span>
                  {data.amount && (
                    <p className="text-sm font-bold text-gray-700 mt-1">
                      R$ {Number(data.amount).toFixed(2).replace('.', ',')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Status de rastreio */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <StatusIcon status={data.rastreio_status} />
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Status do envio</p>
                  <p className="font-bold text-gray-900 text-lg">
                    {data.rastreio_status || (isPaid ? 'Em preparação' : 'Aguardando pagamento')}
                  </p>
                </div>
              </div>

              {data.rastreio_observacao && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3">
                  {data.rastreio_observacao}
                </p>
              )}

              {data.rastreio_codigo && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs text-amber-700 font-semibold uppercase tracking-wide mb-1">
                    Código de rastreio (Correios)
                  </p>
                  <p className="font-mono font-bold text-gray-900 text-lg tracking-widest">
                    {data.rastreio_codigo}
                  </p>
                  <a
                    href={`https://rastreamento.correios.com.br/app/index.php?acao=greeting&objeto=${data.rastreio_codigo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-3 text-sm text-amber-700 font-semibold hover:text-amber-800"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Rastrear nos Correios
                  </a>
                </div>
              )}

              {data.rastreio_atualizado && (
                <p className="text-xs text-gray-400 mt-4">
                  Última atualização: {new Date(data.rastreio_atualizado).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </p>
              )}
            </div>

            {/* Timeline simples */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Linha do tempo</p>
              <div className="space-y-4">
                {[
                  { label: 'Pedido realizado', done: true, date: data.approved_at },
                  { label: 'Pagamento aprovado', done: isPaid, date: data.approved_at },
                  { label: data.rastreio_status || 'Em preparação', done: !!data.rastreio_status, date: data.rastreio_atualizado },
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${step.done ? 'bg-green-500' : 'bg-gray-200'}`}>
                      {step.done ? (
                        <CheckCircle className="w-4 h-4 text-white" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-gray-400" />
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${step.done ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                      {step.done && step.date && (
                        <p className="text-xs text-gray-400">
                          {new Date(step.date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="text-center py-6 text-xs text-gray-400">
        © Lumma FIT · Dúvidas? Entre em contato conosco.
      </div>
    </div>
  );
}
