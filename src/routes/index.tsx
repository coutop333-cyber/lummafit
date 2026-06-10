import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { Star, Check, Truck, Shield, Package, Loader2, Flame, Clock, Lock, ChevronDown, MessageCircle, AlertTriangle, BadgeCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMetaPixel } from '@/hooks/useMetaPixel';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { createKorvexPixPayment, warmKorvexPix } from '@/lib/korvex.functions';
import { captureTracking, newEventId } from '@/lib/tracking';
import { CheckoutForm } from '@/components/CheckoutForm';
import type { PixPaymentInfo } from '@/components/PixCheckoutDialog';
import { OrderReviewDialog, type OrderProduct } from '@/components/OrderReviewDialog';
import pixLogo from '@/assets/pix-logo.png';

import imgAzul from '@/assets/azul.webp';
import imgVerde from '@/assets/verde.webp';
import imgCinza from '@/assets/cinza.webp';
import imgPreta from '@/assets/preta.webp';

const ROSA = '#d63384';
const ROSA_ESCURO = '#b02a6e';
const PRETO = '#111111';

const CORES = [
  { id: 'preta', label: 'Preta',        hex: '#111111', img: imgPreta },
  { id: 'azul',  label: 'Azul Marinho', hex: '#1e3a6e', img: imgAzul  },
  { id: 'verde', label: 'Verde',        hex: '#3d6b5e', img: imgVerde },
  { id: 'cinza', label: 'Cinza',        hex: '#7a7a7a', img: imgCinza },
];

const TAMANHOS = ['P', 'M', 'G', 'GG'];

const MEDIDAS = [
  { t: 'P',  c: '28,5', q: '35', comp: '101' },
  { t: 'M',  c: '30,5', q: '37', comp: '101' },
  { t: 'G',  c: '32,5', q: '39', comp: '101' },
  { t: 'GG', c: '34,5', q: '41', comp: '101' },
];

const PRODUTOS = [
  {
    id: 1,
    nome: '1 Calça Flare Bailarina',
    descricao: '1 calça · escolha a cor',
    microcopy: 'Teste uma unidade',
    preco: 32.99,
    precoAntigo: 89.90,
    desconto: 63,
    precoPorUnidade: 'R$ 32,99/unid.',
    contentId: 'lummafit-1calca',
    quantity: '1 CALÇA FLARE LEGGING BAILARINA CINTURA ALTA LUMMA FIT',
    qtdCores: 1,
  },
  {
    id: 2,
    nome: '2 Calças Flare Bailarina',
    descricao: '2 calças · escolha 2 cores diferentes',
    microcopy: 'Boa escolha',
    preco: 43.99,
    precoAntigo: 159.80,
    desconto: 72,
    precoPorUnidade: 'R$ 22,00/unid.',
    contentId: 'lummafit-2calcas',
    quantity: '2 CALÇAS FLARE LEGGING BAILARINA CINTURA ALTA LUMMA FIT',
    qtdCores: 2,
  },
  {
    id: 3,
    nome: 'Kit 4 Cores — Coleção Completa',
    descricao: '1 preta + 1 azul + 1 verde + 1 cinza',
    microcopy: 'Leve 4 cores pelo menor preço por unidade',
    preco: 65.97,
    precoAntigo: 319.60,
    desconto: 79,
    precoPorUnidade: 'R$ 16,49/unid.',
    contentId: 'lummafit-kit4',
    quantity: 'KIT 4 CALÇAS FLARE LEGGING BAILARINA CINTURA ALTA LUMMA FIT',
    badge: '⭐ MAIS VENDIDO',
    qtdCores: 4,
  },
];

const REVIEWS = [
  { name: 'Camila R.',   city: 'São Paulo · SP', rating: 5, text: 'Achei que fosse transparente, mas o tecido é grosso e veste muito bem. Me surpreendeu demais!', ago: '2 dias' },
  { name: 'Fernanda M.', city: 'Rio · RJ',        rating: 5, text: 'Comprei o kit com 4 cores e valeu muito mais a pena. Cada calça saiu por menos de R$ 17!', ago: '1 dia' },
  { name: 'Juliana S.',  city: 'BH · MG',         rating: 5, text: 'A cintura modela sem apertar. Uso para sair e para treinar. Melhor compra que fiz esse ano.', ago: '3 dias' },
  { name: 'Patrícia L.', city: 'Curitiba · PR',   rating: 5, text: 'Tenho quadril largo e mesmo assim ficou confortável e modelando super bem. Amei!', ago: '5 horas' },
  { name: 'Bruna O.',    city: 'Fortaleza · CE',  rating: 5, text: 'Já é a segunda compra. O tecido é firme, não desbota e dura muito. Recomendo o kit de 4!', ago: '12 horas' },
  { name: 'Larissa T.',  city: 'Porto Alegre · RS', rating: 5, text: 'Presentei minha mãe com o kit e ela ficou encantada. Qualidade incrível pelo preço!', ago: '1 dia' },
];

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Lumma FIT · Calça Flare Legging Bailarina Cintura Alta' },
      { name: 'description', content: 'Cintura fina, pernas alongadas e zero transparência. A legging flare bailarina que modela o corpo. Frete grátis · Pix aprovado na hora.' },
    ],
  }),
  component: LummaFitPage,
});

function LummaFitPage() {
  const [selectedProdutoId, setSelectedProdutoId] = useState(3); // Kit 4 por padrão
  const [selectedCorId, setSelectedCorId] = useState('preta');
  const [selectedCor2Id, setSelectedCor2Id] = useState('verde');
  const [selectedTamanho, setSelectedTamanho] = useState('');
  const [generating, setGenerating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewProduct, setReviewProduct] = useState<OrderProduct | null>(null);
  const [showSizeGuide, setShowSizeGuide] = useState(true);
  const formDataRef = useRef<any>(null);
  const eventIdRef = useRef<string | null>(null);

  const PRODUTO = PRODUTOS.find(p => p.id === selectedProdutoId) ?? PRODUTOS[2];
  const COR = CORES.find(c => c.id === selectedCorId) ?? CORES[0];
  const COR2 = CORES.find(c => c.id === selectedCor2Id) ?? CORES[1];
  const heroImg = COR.img;

  const [timeLeft, setTimeLeft] = useState(20 * 60);
  useEffect(() => {
    const id = setInterval(() => setTimeLeft(p => p <= 1 ? 20 * 60 : p - 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const ss = (timeLeft % 60).toString().padStart(2, '0');

  const [unitsLeft] = useState(18);
  const { trackViewContent, trackAddToCart, trackInitiateCheckout, trackPurchase } = useMetaPixel();

  useEffect(() => {
    captureTracking();
    trackViewContent({ content_name: PRODUTOS[2].nome, content_ids: [PRODUTOS[2].contentId], content_type: 'product', value: PRODUTOS[2].preco, currency: 'BRL', event_id: newEventId('vc') });
  }, []);

  const createPixPayment = useServerFn(createKorvexPixPayment);
  const warmPixProxy = useServerFn(warmKorvexPix);

  useEffect(() => {
    const key = 'korvex_warmed_lumma';
    const last = Number(window.sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 10 * 60 * 1000) return;
    window.sessionStorage.setItem(key, String(Date.now()));
    setTimeout(() => void warmPixProxy(), 1500);
  }, []);

  const getVariacao = () => {
    if (PRODUTO.qtdCores === 4) return `Preta + Azul + Verde + Cinza · Tamanho ${selectedTamanho}`;
    if (PRODUTO.qtdCores === 2) return `${COR.label} + ${COR2.label} · Tamanho ${selectedTamanho}`;
    return `${COR.label} · Tamanho ${selectedTamanho}`;
  };

  const handleBuyClick = (produtoId?: number) => {
    if (generating) return;
    if (!selectedTamanho) { toast.error('Selecione um tamanho antes de continuar'); return; }
    const pid = produtoId ?? selectedProdutoId;
    if (produtoId) setSelectedProdutoId(produtoId);
    const prod = PRODUTOS.find(p => p.id === pid) ?? PRODUTO;
    void warmPixProxy();
    trackAddToCart({ content_name: prod.nome, content_ids: [prod.contentId], value: prod.preco, currency: 'BRL', num_items: 1, event_id: newEventId('atc') });
    setFormOpen(true);
  };

  const handleFormConfirm = (formData: any) => {
    formDataRef.current = formData || {};
    const eventId = newEventId('checkout');
    eventIdRef.current = eventId;
    trackInitiateCheckout({ content_name: PRODUTO.nome, content_ids: [PRODUTO.contentId], value: PRODUTO.preco, currency: 'BRL', num_items: 1, event_id: eventId });
    setFormOpen(false);
    setReviewProduct({ image: heroImg, title: `${PRODUTO.quantity} — Lumma FIT`, variation: getVariacao(), quantity: 1, unitPrice: PRODUTO.preco, price: PRODUTO.preco });
    setReviewOpen(true);
  };

  const handleCreatePixPayment = async (): Promise<PixPaymentInfo | null> => {
    if (generating) return null;
    setGenerating(true);
    try {
      const eventId = eventIdRef.current || newEventId('purchase');
      eventIdRef.current = eventId;
      const tracking = captureTracking();
      const fd = formDataRef.current || {};
      const isTest = (window as any).__lumma_test_mode === true;
      if (isTest) delete (window as any).__lumma_test_mode;
      const payment = await createPixPayment({
        data: {
          kitId: isTest ? 99 : PRODUTO.id,
          title: isTest ? '1 CALÇA TESTE LUMMA FIT' : PRODUTO.quantity,
          unitPrice: isTest ? 5.00 : PRODUTO.preco,
          externalReference: eventId,
          payerEmail: fd.email, payerName: fd.nome, payerPhone: fd.telefone, payerDocument: fd.cpf,
          tracking: { ...tracking, ...(fd.nome ? { name: fd.nome } : {}), ...(fd.email ? { email: fd.email } : {}), ...(fd.telefone ? { phone: fd.telefone } : {}) } as any,
          source: 'produto5' as any,
        },
      });
      return { id: payment.id, txid: payment.txid, status: payment.status, qr_code: payment.qr_code, qr_code_base64: payment.qr_code_base64, ticket_url: payment.ticket_url, external_reference: payment.external_reference, transaction_amount: payment.transaction_amount, expires_at: payment.expires_at };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar Pix.');
      return null;
    } finally { setGenerating(false); }
  };

  const navigate = useNavigate();
  const handlePixApproved = (p: PixPaymentInfo) => {
    trackPurchase({ content_name: PRODUTO.nome, content_ids: [PRODUTO.contentId], value: p.transaction_amount, currency: 'BRL', num_items: 1, event_id: p.external_reference });
    setReviewOpen(false);
    navigate({ to: '/obrigado', search: { ref: p.external_reference, id: String(p.id), value: p.transaction_amount, product: PRODUTO.nome, status: 'approved' }, replace: true });
  };

  const URGENCY_H = 40;
  const kitProd = PRODUTOS.find(p => p.id === 3)!;

  return (
    <div className="min-h-screen bg-white">

      {/* BARRA DE URGÊNCIA */}
      <div className="sticky top-0 z-50 text-white" style={{ background: `linear-gradient(90deg, #8b0036, ${ROSA}, #8b0036)` }}>
        <div className="py-2 px-4 text-center">
          <span className="flex items-center justify-center gap-3 flex-wrap text-sm font-black uppercase tracking-wide">
            <Flame className="w-4 h-4 animate-pulse shrink-0" style={{ color: '#fde68a' }} />
            <span>⚠️ Oferta expira em</span>
            <span className="inline-flex items-center gap-1.5 font-black text-base px-3 py-0.5 rounded-lg" style={{ backgroundColor: '#fde68a', color: '#8b0036', fontFamily: 'Archivo Black, sans-serif' }}>
              <Clock className="w-4 h-4" /> {mm}:{ss}
            </span>
            <span className="hidden sm:inline">· Frete Grátis · Pix na hora</span>
          </span>
        </div>
      </div>

      {/* HEADER */}
      <header className="bg-white border-b-2 sticky z-40" style={{ borderColor: ROSA, top: `${URGENCY_H}px` }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-2xl font-black" style={{ fontFamily: 'Archivo Black, sans-serif', color: PRETO }}>
            Lumma <span style={{ color: ROSA }}>FIT</span>
          </span>
          <div className="flex items-center gap-3">
            <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: '#25D366' }}>
              <MessageCircle className="w-3.5 h-3.5" /> Suporte
            </a>
            <span className="hidden md:flex items-center gap-1 text-xs font-semibold text-green-700"><Shield className="w-3.5 h-3.5" /> Compra segura</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">

        {/* HEADLINE */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-3 text-xs font-bold" style={{ backgroundColor: `${ROSA}15`, color: ROSA, border: `1px solid ${ROSA}30` }}>
            <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />)}</div>
            4.9 · +1.847 clientes satisfeitas
          </div>
          <h1 className="text-3xl md:text-5xl font-black leading-tight mb-3" style={{ fontFamily: 'Archivo Black, sans-serif', color: PRETO }}>
            Cintura fina, pernas alongadas
            <span className="block" style={{ color: ROSA }}>e zero transparência.</span>
          </h1>
          <p className="text-gray-600 text-base max-w-xl mx-auto">
            A legging flare bailarina que <strong>modela o corpo</strong>, valoriza a cintura e deixa qualquer look com aparência mais elegante — com frete grátis e Pix na hora.
          </p>
          <div className="inline-flex items-center gap-2 mt-4 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ backgroundColor: ROSA }}>
            <AlertTriangle className="w-4 h-4" /> Apenas {unitsLeft} unidades restantes hoje
          </div>
        </div>

        {/* GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">

          {/* IMAGEM */}
          <div className="space-y-3">
            <div className="rounded-2xl overflow-hidden shadow-lg aspect-[3/4]" style={{ border: `2px solid ${ROSA}33` }}>
              <img
                src={heroImg}
                alt={`Calça Lumma FIT ${PRODUTO.qtdCores === 4 ? 'Kit 4 Cores' : COR.label}`}
                className="w-full h-full object-cover object-top"
                fetchPriority="high"
              />
            </div>

            {PRODUTO.qtdCores !== 4 && (
              <div className="hidden lg:block bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs font-black uppercase tracking-widest mb-3 text-gray-500">
                  {PRODUTO.qtdCores === 2 ? 'Cor 1:' : 'Cor:'} <span style={{ color: ROSA }}>{COR.label}</span>
                </p>
                <div className="flex gap-3">
                  {CORES.map((cor) => (
                    <button key={cor.id} onClick={() => setSelectedCorId(cor.id)} className="flex flex-col items-center gap-1.5">
                      <img src={cor.img} alt={cor.label} className="w-14 h-14 object-cover object-top rounded-lg border-2 transition-all"
                        style={{ borderColor: selectedCorId === cor.id ? ROSA : '#e5e7eb', boxShadow: selectedCorId === cor.id ? `0 0 0 2px ${ROSA}` : 'none' }} />
                      <span className="text-[9px] font-semibold text-gray-600">{cor.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {PRODUTO.qtdCores === 2 && (
              <div className="hidden lg:block bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs font-black uppercase tracking-widest mb-3 text-gray-500">
                  Cor 2: <span style={{ color: ROSA }}>{COR2.label}</span>
                </p>
                <div className="flex gap-3">
                  {CORES.map((cor) => (
                    <button key={cor.id} onClick={() => setSelectedCor2Id(cor.id)} className="flex flex-col items-center gap-1.5">
                      <img src={cor.img} alt={cor.label} className="w-14 h-14 object-cover object-top rounded-lg border-2 transition-all"
                        style={{ borderColor: selectedCor2Id === cor.id ? ROSA : '#e5e7eb', boxShadow: selectedCor2Id === cor.id ? `0 0 0 2px ${ROSA}` : 'none' }} />
                      <span className="text-[9px] font-semibold text-gray-600">{cor.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {PRODUTO.qtdCores === 4 && (
              <div className="hidden lg:block bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs font-black uppercase tracking-widest mb-3 text-gray-500">Kit inclui as 4 cores:</p>
                <div className="flex gap-3">
                  {CORES.map((cor) => (
                    <div key={cor.id} className="flex flex-col items-center gap-1.5">
                      <img src={cor.img} alt={cor.label} className="w-14 h-14 object-cover object-top rounded-lg border border-gray-200" />
                      <span className="text-[9px] font-semibold text-gray-600">{cor.label.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Shield, label: 'Original', sub: '100% Garantido' },
                { icon: Truck,  label: 'Frete',   sub: 'Grátis' },
                { icon: Package, label: 'Envio',  sub: 'Em 24h' },
              ].map((b, i) => (
                <div key={i} className="flex flex-col items-center gap-1 rounded-xl py-3 bg-white shadow-sm border border-gray-100 text-center">
                  <b.icon className="w-5 h-5" style={{ color: ROSA }} />
                  <span className="text-[10px] font-bold text-gray-800">{b.label}</span>
                  <span className="text-[9px] text-gray-500">{b.sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* OFERTA */}
          <div className="space-y-4">

            {/* OPÇÕES */}
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-2 text-gray-500">Escolha sua opção:</p>
              <div className="space-y-2">

                {/* KIT 4 — destaque máximo */}
                {(() => {
                  const prod = PRODUTOS.find(p => p.id === 3)!;
                  const sel = selectedProdutoId === 3;
                  return (
                    <button
                      onClick={() => setSelectedProdutoId(3)}
                      className="w-full text-left rounded-2xl transition-all relative overflow-hidden"
                      style={{
                        border: `3px solid ${sel ? ROSA : ROSA + '80'}`,
                        background: sel ? `${ROSA}12` : `${ROSA}06`,
                        boxShadow: sel ? `0 0 0 2px ${ROSA}30, 0 6px 20px ${ROSA}20` : `0 2px 8px ${ROSA}10`,
                      }}
                    >
                      {/* Faixa topo */}
                      <div className="flex items-center justify-between px-4 py-1.5" style={{ background: `linear-gradient(90deg, ${ROSA_ESCURO}, ${ROSA})` }}>
                        <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                          <Star className="w-3 h-3 fill-yellow-300 text-yellow-300" /> MAIS VENDIDO · MELHOR CUSTO-BENEFÍCIO
                        </span>
                        <span className="text-[10px] font-black text-white bg-white/20 px-2 py-0.5 rounded-full">79% OFF</span>
                      </div>

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-black text-gray-900 text-base" style={{ fontFamily: 'Archivo Black, sans-serif', color: PRETO }}>
                              {prod.nome}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{prod.descricao}</p>
                            <p className="text-xs font-black mt-1.5" style={{ color: ROSA }}>{prod.microcopy}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#16a34a' }}>
                                ✅ MELHOR CUSTO-BENEFÍCIO
                              </span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#fde68a', color: '#92400e' }}>
                                🔥 {prod.precoPorUnidade}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-400 line-through">R$ {prod.precoAntigo.toFixed(2).replace('.', ',')}</p>
                            <p className="text-2xl font-black" style={{ color: ROSA, fontFamily: 'Archivo Black, sans-serif' }}>
                              R$ {prod.preco.toFixed(2).replace('.', ',')}
                            </p>
                          </div>
                        </div>
                        {sel && (
                          <div className="mt-3 flex items-center gap-1.5 text-xs font-black rounded-xl px-3 py-2" style={{ backgroundColor: `${ROSA}15`, color: ROSA }}>
                            <Check className="w-3.5 h-3.5" strokeWidth={3} /> Selecionado — melhor opção!
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })()}

                {/* Kit 2 e Kit 1 — menor destaque */}
                {PRODUTOS.filter(p => p.id !== 3).map((prod) => {
                  const sel = prod.id === selectedProdutoId;
                  return (
                    <button key={prod.id} onClick={() => setSelectedProdutoId(prod.id)}
                      className="w-full text-left rounded-xl p-3 transition-all relative"
                      style={{
                        border: `1.5px solid ${sel ? ROSA : '#e5e7eb'}`,
                        background: sel ? `${ROSA}06` : 'white',
                        opacity: prod.id === 1 ? 0.85 : 1,
                      }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-700 text-sm">{prod.nome}</p>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{prod.microcopy}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400 line-through">R$ {prod.precoAntigo.toFixed(2).replace('.', ',')}</p>
                          <p className="text-lg font-black" style={{ color: sel ? ROSA : '#6b7280', fontFamily: 'Archivo Black, sans-serif' }}>
                            R$ {prod.preco.toFixed(2).replace('.', ',')}
                          </p>
                          <p className="text-[9px] text-gray-400">{prod.precoPorUnidade}</p>
                        </div>
                      </div>
                      {sel && <Check className="absolute top-3 right-3 w-4 h-4" style={{ color: ROSA }} strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* BLOCO COMPARATIVO */}
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #fdf2f8, #fce7f3)', border: `1.5px solid ${ROSA}30` }}>
              <p className="font-black text-sm mb-3" style={{ color: ROSA }}>💡 Por que a maioria escolhe o Kit 4 Cores?</p>
              <ul className="space-y-2">
                {[
                  'Sai por apenas R$ 16,49 cada — o menor preço por peça',
                  'Você recebe todas as 4 cores mais usadas no dia a dia',
                  'Evita pagar mais caro depois comprando separado',
                  'Ideal para academia, trabalho, viagem e dia a dia',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: ROSA }}>
                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-3 rounded-xl px-3 py-2 text-xs font-black text-center" style={{ background: ROSA, color: 'white' }}>
                🔥 Melhor escolha: 4 calças por menos que o preço de 2 em muitas lojas
              </div>
            </div>

            {/* TAMANHO */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-black uppercase tracking-widest text-gray-500">Tamanho:</p>
                <button onClick={() => setShowSizeGuide(!showSizeGuide)} className="text-xs font-semibold underline" style={{ color: ROSA }}>
                  Guia de tamanhos
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {TAMANHOS.map((t) => (
                  <button key={t} onClick={() => setSelectedTamanho(t)}
                    className="py-3 rounded-xl font-black text-sm transition-all active:scale-95 border-2"
                    style={{ borderColor: selectedTamanho === t ? ROSA : '#e5e7eb', backgroundColor: selectedTamanho === t ? ROSA : 'white', color: selectedTamanho === t ? 'white' : '#374151', fontFamily: 'Archivo Black, sans-serif' }}>
                    {t}
                  </button>
                ))}
              </div>
              {showSizeGuide && (
                <div className="mt-3 rounded-xl overflow-hidden border border-gray-200">
                  <div className="py-2 px-4 text-center text-xs font-black text-white uppercase" style={{ backgroundColor: ROSA }}>Medidas em centímetros</div>
                  <table className="w-full text-xs bg-white">
                    <thead><tr className="bg-gray-50">
                      <th className="py-2 px-3 text-left font-bold text-gray-500">Tam.</th>
                      <th className="py-2 px-3 font-bold text-gray-500">Cintura</th>
                      <th className="py-2 px-3 font-bold text-gray-500">Quadril</th>
                      <th className="py-2 px-3 font-bold text-gray-500">Compr.</th>
                    </tr></thead>
                    <tbody>
                      {MEDIDAS.map((row) => (
                        <tr key={row.t} className="border-t border-gray-100" style={selectedTamanho === row.t ? { backgroundColor: `${ROSA}10` } : {}}>
                          <td className="py-2 px-3 font-black" style={{ color: ROSA }}>{row.t}</td>
                          <td className="py-2 px-3 text-center text-gray-700">{row.c}</td>
                          <td className="py-2 px-3 text-center text-gray-700">{row.q}</td>
                          <td className="py-2 px-3 text-center text-gray-700">{row.comp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* CORES MOBILE */}
            {PRODUTO.qtdCores !== 4 && (
              <div className="lg:hidden bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs font-black uppercase tracking-widest mb-3 text-gray-500">
                  {PRODUTO.qtdCores === 2 ? 'Cor 1:' : 'Cor:'} <span style={{ color: ROSA }}>{COR.label}</span>
                </p>
                <div className="flex gap-3">
                  {CORES.map((cor) => (
                    <button key={cor.id} onClick={() => setSelectedCorId(cor.id)} className="flex flex-col items-center gap-1.5">
                      <img src={cor.img} alt={cor.label} className="w-14 h-14 object-cover object-top rounded-lg border-2 transition-all"
                        style={{ borderColor: selectedCorId === cor.id ? ROSA : '#e5e7eb', boxShadow: selectedCorId === cor.id ? `0 0 0 2px ${ROSA}` : 'none' }} />
                      <span className="text-[9px] font-semibold text-gray-600">{cor.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {PRODUTO.qtdCores === 2 && (
              <div className="lg:hidden bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs font-black uppercase tracking-widest mb-3 text-gray-500">
                  Cor 2: <span style={{ color: ROSA }}>{COR2.label}</span>
                </p>
                <div className="flex gap-3">
                  {CORES.map((cor) => (
                    <button key={cor.id} onClick={() => setSelectedCor2Id(cor.id)} className="flex flex-col items-center gap-1.5">
                      <img src={cor.img} alt={cor.label} className="w-14 h-14 object-cover object-top rounded-lg border-2 transition-all"
                        style={{ borderColor: selectedCor2Id === cor.id ? ROSA : '#e5e7eb', boxShadow: selectedCor2Id === cor.id ? `0 0 0 2px ${ROSA}` : 'none' }} />
                      <span className="text-[9px] font-semibold text-gray-600">{cor.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {PRODUTO.qtdCores === 4 && (
              <div className="lg:hidden bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs font-black uppercase tracking-widest mb-3 text-gray-500">Kit inclui as 4 cores:</p>
                <div className="flex gap-3">
                  {CORES.map((cor) => (
                    <div key={cor.id} className="flex flex-col items-center gap-1.5">
                      <img src={cor.img} alt={cor.label} className="w-14 h-14 object-cover object-top rounded-lg border border-gray-200" />
                      <span className="text-[9px] font-semibold text-gray-600">{cor.label.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PREÇO */}
            <div className="rounded-2xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${ROSA}, ${ROSA_ESCURO})` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm line-through opacity-70">De R$ {PRODUTO.precoAntigo.toFixed(2).replace('.', ',')}</span>
                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-white" style={{ color: ROSA }}>{PRODUTO.desconto}% OFF</span>
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-xl font-bold">R$</span>
                <span className="text-6xl font-black" style={{ fontFamily: 'Archivo Black, sans-serif', color: '#fde68a' }}>{Math.floor(PRODUTO.preco)}</span>
                <span className="text-2xl font-bold" style={{ color: '#fde68a' }}>,{PRODUTO.preco.toFixed(2).split('.')[1]}</span>
              </div>
              {PRODUTO.id === 3 && (
                <p className="text-xs font-black mb-2 opacity-90">= R$ 16,49 por calça · menor preço por unidade</p>
              )}
              <p className="text-xs opacity-80 mb-3">Você economiza R$ {(PRODUTO.precoAntigo - PRODUTO.preco).toFixed(2).replace('.', ',')} nessa compra</p>
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/15">
                <img src={pixLogo} alt="Pix" className="h-7 w-7 bg-white rounded-full p-1 object-contain" />
                <div>
                  <p className="text-sm font-black">Preço exclusivo no Pix</p>
                  <p className="text-[10px] opacity-80">Aprovação imediata · envio em até 24h</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-green-50 border border-green-200">
              <Truck className="w-5 h-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-black text-green-800">Frete Grátis para todo o Brasil</p>
                <p className="text-xs text-green-700">Envio rastreado · 3 a 7 dias úteis</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold rounded-lg px-3 py-2.5 bg-amber-50 border border-amber-200 text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Apenas <strong>{unitsLeft} unidades</strong> em estoque hoje · expira em {mm}:{ss}</span>
            </div>

            {/* BULLETS */}
            <ul className="space-y-2 bg-white rounded-xl p-4 border border-gray-100">
              {[
                'Modela sem apertar — cintura alta sustentada',
                'Alonga visualmente as pernas com corte flare',
                'Tecido grosso, confortável e sem transparência',
                'Ideal para treino, passeio e dia a dia',
                'Kit com 4 cores para combinar com qualquer look',
              ].map((t, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-gray-800">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: ROSA }}>
                    <Check className="h-3 w-3 text-white" strokeWidth={4} />
                  </div>
                  {t}
                </li>
              ))}
            </ul>

            {/* CTA DESKTOP */}
            <div className="hidden lg:block space-y-2">
              <Button disabled={generating} onClick={() => handleBuyClick()}
                className="w-full py-7 text-lg font-black uppercase text-white active:scale-[0.98] transition-transform"
                style={{ background: `linear-gradient(135deg, ${ROSA}, ${ROSA_ESCURO})`, fontFamily: 'Archivo Black, sans-serif', boxShadow: `0 8px 25px ${ROSA}55` }}>
                {generating
                  ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Gerando Pix...</>
                  : selectedProdutoId === 3
                  ? `🏆 QUERO O KIT COMPLETO — R$ 65,97`
                  : `💳 QUERO MINHA CALÇA — R$ ${PRODUTO.preco.toFixed(2).replace('.', ',')}`}
              </Button>
              <div className="flex items-center justify-center gap-4 text-[11px] text-gray-500">
                <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-green-600" />Pagamento seguro</span>
                <span className="flex items-center gap-1"><Truck className="w-3 h-3 text-green-600" />Frete grátis</span>
                <span className="flex items-center gap-1"><Package className="w-3 h-3 text-green-600" />Envio com rastreio</span>
              </div>
            </div>
          </div>
        </div>

        {/* COMPRA 100% SEGURA */}
        <div className="mb-10 rounded-2xl p-6 bg-gray-50 border border-gray-200">
          <h2 className="text-lg font-black text-center mb-4 flex items-center justify-center gap-2" style={{ color: PRETO }}>
            <BadgeCheck className="w-5 h-5 text-green-600" /> Compra 100% Segura
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Truck,       titulo: 'Frete Grátis',      sub: 'Para todo o Brasil' },
              { icon: Package,     titulo: 'Envio Rastreado',   sub: 'Acompanhe o pedido' },
              { icon: Zap,         titulo: 'Pix Aprovado',      sub: 'Na hora, sem espera' },
              { icon: MessageCircle, titulo: 'Suporte',         sub: 'Troca de tamanho' },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 bg-white rounded-xl p-3 text-center border border-gray-100 shadow-sm">
                <item.icon className="w-6 h-6" style={{ color: ROSA }} />
                <p className="text-xs font-black text-gray-900">{item.titulo}</p>
                <p className="text-[10px] text-gray-500">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* DIFERENCIAIS */}
        <div className="mb-10">
          <h2 className="text-2xl font-black text-center mb-6" style={{ fontFamily: 'Archivo Black, sans-serif', color: PRETO }}>Por que escolher a Lumma FIT?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { emoji: '✨', titulo: 'Modelagem exclusiva', desc: 'Cintura alta que modela e define sem apertar. Sinta a diferença no primeiro uso.' },
              { emoji: '👗', titulo: 'Flare que alonga', desc: 'O corte bailarina cria a ilusão de pernas mais longas e valoriza as curvas naturalmente.' },
              { emoji: '💪', titulo: 'Tecido premium', desc: 'Grosso com compressão leve — não transparece, não deforma, dura por anos.' },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 text-center shadow-sm border border-gray-100">
                <span className="text-3xl mb-3 block">{item.emoji}</span>
                <h3 className="font-black text-gray-900 mb-2" style={{ fontFamily: 'Archivo Black, sans-serif' }}>{item.titulo}</h3>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* REVIEWS */}
        <div className="mb-10">
          <h2 className="text-2xl font-black text-center mb-2" style={{ fontFamily: 'Archivo Black, sans-serif', color: PRETO }}>O que nossas clientes dizem</h2>
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />)}</div>
            <span className="font-bold text-gray-800">4.9 / 5.0 · 1.847 avaliações</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {REVIEWS.map((r, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex">{[...Array(r.rating)].map((_, j) => <Star key={j} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}</div>
                  <span className="text-[10px] text-gray-400">há {r.ago}</span>
                </div>
                <p className="text-sm text-gray-700 italic mb-3">"{r.text}"</p>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{r.name}</p>
                    <p className="text-[10px] text-gray-500">{r.city}</p>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white flex items-center gap-1" style={{ backgroundColor: ROSA }}>
                    <Check className="w-2.5 h-2.5" /> Verificada
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA FINAL — Kit 4 em destaque */}
        <div className="mb-8 rounded-2xl overflow-hidden shadow-xl text-white text-center" style={{ background: `linear-gradient(135deg, ${PRETO}, #333)`, border: `3px solid ${ROSA}` }}>
          <div className="py-3 font-black text-sm flex items-center justify-center gap-2" style={{ backgroundColor: ROSA }}>
            <Flame className="w-4 h-4" /> ÚLTIMAS {unitsLeft} UNIDADES · EXPIRA EM {mm}:{ss}
          </div>
          <div className="p-7">
            <h3 className="text-2xl font-black mb-2" style={{ fontFamily: 'Archivo Black, sans-serif' }}>Garanta a sua agora</h3>
            <p className="text-white/80 text-sm mb-6">Frete grátis · Pix aprovado na hora · Envio em 24h</p>
            <div className="flex flex-col gap-3 max-w-sm mx-auto">
              {/* Kit 4 — botão principal */}
              <Button disabled={generating} onClick={() => { setSelectedProdutoId(3); handleBuyClick(3); }}
                className="w-full py-6 text-base font-black uppercase text-white active:scale-[0.98]"
                style={{ background: `linear-gradient(135deg, ${ROSA}, ${ROSA_ESCURO})`, boxShadow: `0 6px 20px ${ROSA}55`, fontSize: '1rem' }}>
                🏆 KIT 4 CORES — R$ 65,97 · R$ 16,49/unid.
              </Button>
              {/* Kit 2 */}
              <Button disabled={generating} onClick={() => { setSelectedProdutoId(2); handleBuyClick(2); }}
                className="w-full py-4 text-sm font-bold uppercase text-white active:scale-[0.98]"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                2 calças — R$ 43,99
              </Button>
              {/* Kit 1 — menor destaque */}
              <button disabled={generating} onClick={() => { setSelectedProdutoId(1); handleBuyClick(1); }}
                className="w-full py-2 text-xs font-semibold text-white/50 hover:text-white/70 transition-colors">
                ou 1 calça por R$ 32,99
              </button>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-8">
          <h2 className="text-xl font-black text-center mb-5" style={{ fontFamily: 'Archivo Black, sans-serif', color: PRETO }}>Dúvidas frequentes</h2>
          <div className="space-y-2 max-w-2xl mx-auto">
            {[
              { q: 'O tecido é transparente?', a: 'Não! O tecido da Lumma FIT é grosso e premium — não transparece. Você pode usar com total confiança.' },
              { q: 'Como escolho o tamanho?', a: 'Consulte a tabela de medidas disponível na página. Meça sua cintura e quadril. Em caso de dúvida, prefira o tamanho maior.' },
              { q: 'Em quanto tempo chega?', a: 'Despachamos em até 24h após o Pix confirmar. Entrega em 3 a 7 dias úteis para todo o Brasil com rastreio.' },
              { q: 'Posso trocar se não ficar bom?', a: 'Sim! Se chegar com defeito ou diferente do descrito, entre em contato pelo WhatsApp em até 7 dias.' },
              { q: 'O frete é realmente grátis?', a: 'Sim, 100% grátis para todos os estados do Brasil.' },
            ].map((f, i) => (
              <details key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm group">
                <summary className="font-bold text-gray-900 list-none flex items-center justify-between text-sm cursor-pointer">
                  {f.q}
                  <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180 shrink-0 ml-2" />
                </summary>
                <p className="mt-3 text-sm text-gray-600 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-center py-8 text-gray-500 text-xs pb-28 lg:pb-8">
        <p className="font-black text-lg mb-1" style={{ color: ROSA }}>Lumma FIT</p>
        <p>© 2026 Lumma FIT · Moda Feminina · Compra 100% segura</p>
      </footer>

      {/* COMPRA TESTE */}
      <div className="max-w-5xl mx-auto px-4 pb-6">
        <details className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
          <summary className="px-4 py-3 text-xs text-gray-400 cursor-pointer select-none list-none flex items-center justify-between hover:text-gray-500">
            <span>Compra teste</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </summary>
          <div className="px-4 pb-4 pt-2 border-t border-gray-200 bg-white">
            <p className="text-xs text-gray-500 mb-3">Gera um Pix real de R$ 5,00 para testar o fluxo completo.</p>
            <Button
              disabled={generating}
              onClick={() => {
                if (!selectedTamanho) setSelectedTamanho('M');
                void warmPixProxy();
                setReviewProduct({
                  image: imgPreta,
                  title: '1 CALÇA TESTE LUMMA FIT',
                  variation: 'Teste · R$ 5,00',
                  quantity: 1,
                  unitPrice: 5.00,
                  price: 5.00,
                });
                (window as any).__lumma_test_mode = true;
                setFormOpen(true);
              }}
              variant="outline"
              className="text-xs h-8 px-4 border-gray-300 text-gray-600"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Gerar Pix de R$ 5,00'}
            </Button>
          </div>
        </details>
      </div>

      {/* MOBILE CTA FIXO */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 shadow-[0_-8px_30px_rgba(214,51,132,0.25)]">
        <div className="py-1.5 px-4 text-center text-[11px] font-black uppercase text-white flex items-center justify-center gap-2" style={{ backgroundColor: '#8b0036' }}>
          <Flame className="w-3 h-3 animate-pulse" style={{ color: '#fde68a' }} />
          <span>⏰ Expira em <strong style={{ color: '#fde68a' }}>{mm}:{ss}</strong> · só {unitsLeft} unidades</span>
        </div>
        <div className="bg-white border-t-2 p-3" style={{ borderColor: ROSA }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[10px] font-black uppercase" style={{ color: ROSA }}>{PRODUTO.descricao}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-gray-400 line-through">R$ {PRODUTO.precoAntigo.toFixed(2).replace('.', ',')}</span>
                <span className="text-2xl font-black" style={{ color: ROSA, fontFamily: 'Archivo Black, sans-serif' }}>R$ {PRODUTO.preco.toFixed(2).replace('.', ',')}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: ROSA }}>-{PRODUTO.desconto}%</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-gray-500">Frete grátis</p>
              <p className="text-[9px]" style={{ color: ROSA }}>{PRODUTO.precoPorUnidade}</p>
            </div>
          </div>
          <Button disabled={generating} onClick={() => handleBuyClick()}
            className="w-full py-5 text-base font-black uppercase text-white active:scale-[0.98]"
            style={{ background: `linear-gradient(135deg, ${ROSA}, ${ROSA_ESCURO})`, fontFamily: 'Archivo Black, sans-serif', boxShadow: `0 4px 20px ${ROSA}55` }}>
            {generating
              ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Gerando Pix...</>
              : selectedProdutoId === 3
              ? '🏆 QUERO O KIT COMPLETO AGORA'
              : '💳 GARANTIR MINHA CALÇA AGORA'}
          </Button>
          <p className="text-center text-[10px] text-gray-400 mt-1.5">Pagamento seguro • Frete grátis • Envio com rastreio</p>
        </div>
      </div>

      <CheckoutForm open={formOpen} onOpenChange={setFormOpen} onConfirm={handleFormConfirm}
        headerEyebrow="👗 Lumma FIT" title={PRODUTO.nome}
        description={getVariacao()}
        submitLabel="CONTINUAR PARA O PAGAMENTO →" primaryColor={ROSA} accentColor="#fde68a" />
      <OrderReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} product={reviewProduct}
        onPay={handleCreatePixPayment} onApproved={handlePixApproved}
        headerEyebrow="👗 Lumma FIT" title={PRODUTO.nome}
        description={getVariacao()}
        primaryColor={ROSA} accentColor="#fde68a"
        payButtonLabel={(total) => `💳 Pagar R$ ${total} com Pix`} />
    </div>
  );
}
