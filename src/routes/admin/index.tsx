import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useServerFn } from '@tanstack/react-start';
import {
  adminListOrders,
  adminSaveRastreio,
  adminBulkUpdateRastreio,
  adminGetRastreio,
} from '@/lib/admin.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Package, Search, Send, RefreshCw, LogOut, ChevronDown, ChevronUp,
  Truck, CheckCircle, Clock, AlertCircle, Mail
} from 'lucide-react';

export const Route = createFileRoute('/admin/')({
  head: () => ({ meta: [{ title: 'Admin — Lumma FIT' }, { name: 'robots', content: 'noindex' }] }),
  component: AdminPage,
});

const STATUS_SUGERIDOS = [
  'Pedido recebido',
  'Pagamento aprovado',
  'Em separação',
  'Postado nos Correios',
  'Em trânsito',
  'Saiu para entrega',
  'Entregue',
  'Tentativa de entrega',
];

function formatBRL(v: number) {
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const colors: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    approved: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    rejected: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colors[s] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [senha, setSenha] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterData, setFilterData] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rastreios, setRastreios] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // Bulk update state
  const [bulkData, setBulkData] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkObs, setBulkObs] = useState('');
  const [bulkCodigo, setBulkCodigo] = useState('');
  const [bulkEmail, setBulkEmail] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const listOrders = useServerFn(adminListOrders);
  const saveRastreio = useServerFn(adminSaveRastreio);
  const bulkUpdate = useServerFn(adminBulkUpdateRastreio);
  const getRastreio = useServerFn(adminGetRastreio);

  const load = async (s = senha) => {
    setLoading(true);
    try {
      const data = await listOrders({ data: { senha: s, data: filterData || undefined, status: filterStatus || undefined, page: 1 } });
      setOrders(data as any[]);
      setAuthed(true);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await load(senha);
  };

  const handleExpand = async (orderId: string, codigoPedido: string) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    if (!rastreios[codigoPedido]) {
      try {
        const r = await getRastreio({ data: { senha, codigo_pedido: codigoPedido } });
        setRastreios((prev) => ({ ...prev, [codigoPedido]: r || {} }));
      } catch {}
    }
  };

  const handleSave = async (codigoPedido: string, enviarEmail: boolean) => {
    const r = rastreios[codigoPedido] || {};
    if (!r.status) { toast.error('Informe o status de rastreio'); return; }
    setSaving((p) => ({ ...p, [codigoPedido]: true }));
    try {
      const result = await saveRastreio({
        data: {
          senha,
          codigo_pedido: codigoPedido,
          status: r.status,
          observacao: r.observacao || '',
          codigo_rastreio: r.codigo_rastreio || '',
          enviar_email: enviarEmail,
        },
      });
      toast.success(enviarEmail && (result as any).email_sent ? 'Salvo e e-mail enviado!' : 'Rastreio salvo!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar');
    } finally {
      setSaving((p) => ({ ...p, [codigoPedido]: false }));
    }
  };

  const handleBulk = async () => {
    if (!bulkData || !bulkStatus) { toast.error('Informe a data e o status'); return; }
    setBulkLoading(true);
    try {
      const result = await bulkUpdate({
        data: {
          senha,
          data: bulkData,
          status: bulkStatus,
          observacao: bulkObs,
          codigo_rastreio: bulkCodigo || undefined,
          enviar_email: bulkEmail,
          apenas_pagos: true,
        },
      });
      const r = result as any;
      toast.success(`Atualizado: ${r.updated} pedidos${bulkEmail ? `, ${r.emails} e-mails enviados` : ''}`);
    } catch (err: any) {
      toast.error(err?.message || 'Erro na atualização em massa');
    } finally {
      setBulkLoading(false);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-gray-900">LUMMA FIT</h1>
            <p className="text-sm text-gray-500 mt-1">Painel Administrativo</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label>Senha</Label>
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••" autoFocus />
            </div>
            <Button type="submit" className="w-full bg-gray-900 text-white" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black">LUMMA FIT · Admin</h1>
          <p className="text-xs text-gray-400">{orders.length} pedidos carregados</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAuthed(false)} className="text-gray-400 hover:text-white">
          <LogOut className="w-4 h-4 mr-1" /> Sair
        </Button>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ===== Filtros ===== */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-4">Filtrar Pedidos</h2>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-gray-400 text-xs">Data (opcional)</Label>
              <Input type="date" value={filterData} onChange={(e) => setFilterData(e.target.value)} className="bg-gray-800 border-gray-700 text-white w-44" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Status (opcional)</Label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-9 rounded-md border border-gray-700 bg-gray-800 text-white px-3 text-sm">
                <option value="">Todos</option>
                <option value="paid">Pago</option>
                <option value="pending">Pendente</option>
                <option value="rejected">Rejeitado</option>
              </select>
            </div>
            <Button onClick={() => load()} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
              <Search className="w-4 h-4 mr-1" /> {loading ? 'Buscando...' : 'Buscar'}
            </Button>
            <Button variant="outline" onClick={() => { setFilterData(''); setFilterStatus(''); load(); }} className="border-gray-700 text-gray-300">
              <RefreshCw className="w-4 h-4 mr-1" /> Limpar
            </Button>
          </div>
        </div>

        {/* ===== Atualização em Massa ===== */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-4">
            <Truck className="w-4 h-4 inline mr-2 text-indigo-400" />
            Atualizar Rastreio em Massa (por data)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div>
              <Label className="text-gray-400 text-xs">Data do pedido</Label>
              <Input type="date" value={bulkData} onChange={(e) => setBulkData(e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Novo status</Label>
              <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="w-full h-9 rounded-md border border-gray-700 bg-gray-800 text-white px-3 text-sm">
                <option value="">Selecione...</option>
                {STATUS_SUGERIDOS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Cód. rastreio (opcional)</Label>
              <Input value={bulkCodigo} onChange={(e) => setBulkCodigo(e.target.value)} placeholder="AA123456789BR" className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Observação (opcional)</Label>
              <Input value={bulkObs} onChange={(e) => setBulkObs(e.target.value)} placeholder="Ex: Objeto postado" className="bg-gray-800 border-gray-700 text-white" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={bulkEmail} onChange={(e) => setBulkEmail(e.target.checked)} className="rounded" />
              <Mail className="w-4 h-4 text-indigo-400" /> Enviar e-mail para todos os clientes
            </label>
            <Button onClick={handleBulk} disabled={bulkLoading} className="bg-indigo-600 hover:bg-indigo-700">
              <Send className="w-4 h-4 mr-2" /> {bulkLoading ? 'Atualizando...' : 'Atualizar Todos'}
            </Button>
          </div>
        </div>

        {/* ===== Lista de Pedidos ===== */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest">
              <Package className="w-4 h-4 inline mr-2 text-indigo-400" />
              Pedidos ({orders.length})
            </h2>
          </div>

          {orders.length === 0 ? (
            <div className="text-center py-16 text-gray-500">Nenhum pedido encontrado</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {orders.map((order) => {
                const codigo = order.external_reference;
                const tp = order.tracking_payload || {};
                const expanded = expandedId === order.id;
                const r = rastreios[codigo] || {};

                return (
                  <div key={order.id}>
                    {/* Row */}
                    <button
                      className="w-full text-left px-5 py-4 hover:bg-gray-800/50 transition-colors"
                      onClick={() => handleExpand(order.id, codigo)}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-gray-400">{codigo.slice(-12)}</span>
                            <StatusBadge status={order.status} />
                            {order.tracking_email_sent_at && (
                              <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">📧 email enviado</span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-semibold text-white">{tp.name || '—'}</span>
                            <span className="text-xs text-gray-400">{tp.email || ''}</span>
                            <span className="text-sm font-bold text-green-400">{formatBRL(order.amount)}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-gray-500">
                            {order.kit_title} · {formatDate(order.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>
                    </button>

                    {/* Expanded — rastreio */}
                    {expanded && (
                      <div className="px-5 pb-5 bg-gray-800/30">
                        <div className="border border-gray-700 rounded-xl p-4 space-y-3">
                          <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                            <Truck className="w-4 h-4 text-indigo-400" /> Rastreio do pedido
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <Label className="text-gray-400 text-xs">Status</Label>
                              <select
                                value={r.status || ''}
                                onChange={(e) => setRastreios((p) => ({ ...p, [codigo]: { ...p[codigo], status: e.target.value } }))}
                                className="w-full h-9 rounded-md border border-gray-700 bg-gray-900 text-white px-3 text-sm mt-1"
                              >
                                <option value="">Selecione...</option>
                                {STATUS_SUGERIDOS.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div>
                              <Label className="text-gray-400 text-xs">Código de rastreio</Label>
                              <Input
                                value={r.codigo_rastreio || ''}
                                onChange={(e) => setRastreios((p) => ({ ...p, [codigo]: { ...p[codigo], codigo_rastreio: e.target.value } }))}
                                placeholder="AA123456789BR"
                                className="bg-gray-900 border-gray-700 text-white mt-1"
                              />
                            </div>
                            <div>
                              <Label className="text-gray-400 text-xs">Observação</Label>
                              <Input
                                value={r.observacao || ''}
                                onChange={(e) => setRastreios((p) => ({ ...p, [codigo]: { ...p[codigo], observacao: e.target.value } }))}
                                placeholder="Ex: Saiu para entrega"
                                className="bg-gray-900 border-gray-700 text-white mt-1"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              onClick={() => handleSave(codigo, false)}
                              disabled={saving[codigo]}
                              className="bg-gray-700 hover:bg-gray-600"
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {saving[codigo] ? 'Salvando...' : 'Salvar'}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSave(codigo, true)}
                              disabled={saving[codigo] || !tp.email}
                              className="bg-indigo-600 hover:bg-indigo-700"
                              title={!tp.email ? 'Cliente sem e-mail cadastrado' : ''}
                            >
                              <Mail className="w-3 h-3 mr-1" />
                              Salvar + Enviar e-mail
                            </Button>
                            <a
                              href={`/rastreio/${codigo}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 ml-auto"
                            >
                              Ver página do cliente →
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
