import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { Star, Check, Truck, Shield, Package, Loader2, Clock, Lock, ChevronDown, MessageCircle, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
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

import imgClaro from '@/assets/wide-jeans-claro.jpg';
import imgClaroB from '@/assets/wide-jeans-claro-costas.jpg';
import imgPreto from '@/assets/wide-jeans-preto.jpg';
import imgEscuro from '@/assets/wide-jeans-escuro.jpg';
import imgAreia from '@/assets/wide-jeans-areia.jpg';
import imgHero from '@/assets/wide-jeans-hero.jpg';

// Paleta premium DR
const GOLD   = '#c9a84c';
const GOLD2  = '#e8c96b';
const DARK   = '#0a0a0a';
const DARK2  = '#141414';
const DARK3  = '#1e1e1e';
const CINZA  = '#2a2a2a';
const BRANCO = '#f5f5f0';

const CORES = [
  { id: 'claro',  label: 'Jeans Claro',  hex: '#a8c5e0', img: imgClaro  },
  { id: 'escuro', label: 'Jeans Escuro', hex: '#1e3a6e', img: imgEscuro },
  { id: 'preto',  label: 'Preto',        hex: '#222222', img: imgPreto  },
  { id: 'areia',  label: 'Areia',        hex: '#d4c5a9', img: imgAreia  },
];

const TAMANHOS = ['36', '38', '40', '42', '44'];

const MEDIDAS = [
  { t: '36', c: '72', alt: '110' },
  { t: '38', c: '76', alt: '110,5' },
  { t: '40', c: '80', alt: '111' },
  { t: '42', c: '84', alt: '111,5' },
  { t: '44', c: '88', alt: '112' },
];

const PRODUTOS = [
  {
    id: 10,
    nome: '1 Calça Wide Leg Jeans',
    descricao: '1 calça · escolha a cor e tamanho',
    microcopy: 'Experimente uma unidade',
    preco: 39.90,
    precoAntigo: 129.90,
    desconto: 69,
    precoPorUnidade: 'R$ 39,90/unid.',
    contentId: 'lummafit-widelegjeans-1',
    quantity: '1 CALÇA WIDE LEG JEANS CINTURA ALTA LUMMA FIT',
    qtdCores: 1,
  },
  {
    id: 11,
    nome: '2 Calças Wide Leg Jeans',
    descricao: '2 calças · escolha 2 cores diferentes',
    microcopy: 'Leve 2 e economize R$ 19,90',
    preco: 59.90,
    precoAntigo: 259.80,
    desconto: 77,
    precoPorUnidade: 'R$ 29,95/unid.',
    contentId: 'lummafit-widelegjeans-2',
    quantity: '2 CALÇAS WIDE LEG JEANS CINTURA ALTA LUMMA FIT',
    qtdCores: 2,
  },
];

const REVIEWS = [
  { name: 'Bianca M.',   city: 'São Paulo · SP', rating: 5, text: 'Comprei o par e amei! O corte wide leg alonga demais as pernas. Tecido ótimo, não amassa.' },
  { name: 'Tatiane R.',  city: 'Rio de Janeiro', rating: 5, text: 'O jeans claro ficou lindo! Cai perfeito na cintura. Já quero comprar mais uma cor.' },
  { name: 'Priscila S.', city: 'Belo Horizonte', rating: 5, text: 'Cintura alta e wide leg é a combinação perfeita. Frete grátis e chegou super rápido!' },
  { name: 'Ana C.',      city: 'Curitiba · PR',  rating: 5, text: 'Tenho quadril largo e ficou impecável. Super versátil, uso para trabalho e para sair.' },
  { name: 'Fernanda L.', city: 'Fortaleza · CE', rating: 5, text: 'Qualidade muito acima do esperado. Comprei as duas cores e não me arrependi.' },
  { name: 'Juliana T.',  city: 'Recife · PE',    rating: 5, text: 'Chegou em 4 dias, bem embalada. O caimento é exato. Recomendo muito o kit de 2!' },
];

export const Route = createFileRoute('/wide-leg')({
  head: () => ({
    meta: [
      { title: 'Calça Wide Leg Jeans · Cintura Alta · Lumma FIT' },
      { name: 'description', content: 'Calça Wide Leg Jeans Cintura Alta. Alonga as pernas, modela a silhueta. Frete grátis · Pix aprovado na hora.' },
    ],
  }),
  component: WideLeqPage,
});

function WideLeqPage() {
  const [selectedProdutoId, setSelectedProdutoId] = useState(11);
  const [selectedCorId, setSelectedCorId] = useState('claro');
  const [selectedCor2Id, setSelectedCor2Id] = useState('escuro');
  const [selectedTamanho, setSelectedTamanho] = useState('');
  const [generating, setGenerating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewProduct, setReviewProduct] = useState<OrderProduct | null>(null);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [heroImg, setHeroImg] = useState(imgHero);
  const formDataRef = useRef<any>(null);
  const eventIdRef = useRef<string | null>(null);

  const PRODUTO = PRODUTOS.find(p => p.id === selectedProdutoId) ?? PRODUTOS[1];
  const COR  = CORES.find(c => c.id === selectedCorId)  ?? CORES[0];
  const COR2 = CORES.find(c => c.id === selectedCor2Id) ?? CORES[1];

  useEffect(() => { setHeroImg(COR.img); }, [COR]);

  const [timeLeft, setTimeLeft] = useState(18 * 60);
  useEffect(() => {
    const id = setInterval(() => setTimeLeft(p => p <= 1 ? 18 * 60 : p - 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const ss = (timeLeft % 60).toString().padStart(2, '0');

  const [unitsLeft] = useState(14);
  const { trackViewContent, trackAddToCart, trackInitiateCheckout, trackPurchase } = useMetaPixel();

  useEffect(() => {
    captureTracking();
    trackViewContent({ content_name: PRODUTOS[1].nome, content_ids: [PRODUTOS[1].contentId], content_type: 'product', value: PRODUTOS[1].preco, currency: 'BRL', event_id: newEventId('vc') });
  }, []);

  const createPixPayment = useServerFn(createKorvexPixPayment);
  const warmPixProxy = useServerFn(warmKorvexPix);

  useEffect(() => {
    const key = 'korvex_warmed_wide';
    const last = Number(window.sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 10 * 60 * 1000) return;
    window.sessionStorage.setItem(key, String(Date.now()));
    setTimeout(() => void warmPixProxy(), 1500);
  }, []);

  const getVariacao = () => {
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
      const payment = await createPixPayment({
        data: {
          kitId: PRODUTO.id,
          title: PRODUTO.quantity,
          unitPrice: PRODUTO.preco,
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

  return (
    <div className="min-h-screen" style={{ background: DARK, color: BRANCO, fontFamily: 'Archivo Black, sans-serif' }}>

      {/* BARRA DE URGÊNCIA */}
      <div className="sticky top-0 z-50" style={{ background: `linear-gradient(90deg, ${DARK}, ${GOLD}, ${DARK})` }}>
        <div className="py-2 px-4 text-center">
          <span className="flex items-center justify-center gap-3 flex-wrap text-sm font-black uppercase tracking-widest" style={{ color: DARK }}>
            <Clock className="w-4 h-4 shrink-0" />
            <span>Oferta encerra em</span>
            <span className="font-black text-base px-3 py-0.5 rounded-lg" style={{ backgroundColor: DARK, color: GOLD }}>
              {mm}:{ss}
            </span>
            <span className="hidden sm:inline">· Frete Grátis · Apenas {unitsLeft} unidades</span>
          </span>
        </div>
      </div>

      {/* HEADER */}
      <header className="border-b sticky z-40" style={{ borderColor: '#2a2a2a', background: DARK2, top: '40px' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-2xl font-black tracking-wider" style={{ color: BRANCO }}>
            Lumma <span style={{ color: GOLD }}>FIT</span>
          </span>
          <div className="flex items-center gap-3">
            <a href="https://wa.me/5511999999999" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ backgroundColor: '#25D366', color: '#fff' }}>
              <MessageCircle className="w-3.5 h-3.5" /> Suporte
            </a>
            <span className="hidden md:flex items-center gap-1 text-xs font-semibold" style={{ color: GOLD }}>
              <ShieldCheck className="w-3.5 h-3.5" /> Compra segura
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* HEADLINE */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-4 text-xs font-black uppercase tracking-widest" style={{ backgroundColor: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}40` }}>
            <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />)}</div>
            4.9 · +980 clientes satisfeitas
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-tight mb-4 tracking-tight" style={{ color: BRANCO }}>
            A calça que transforma
            <span className="block" style={{ color: GOLD }}>qualquer silhueta.</span>
          </h1>
          <p className="text-lg max-w-xl mx-auto font-normal" style={{ color: '#9a9a9a' }}>
            Wide Leg Jeans cintura alta — alonga as pernas, define a cintura e eleva qualquer look. Frete grátis + Pix na hora.
          </p>
        </div>

        {/* GRID PRINCIPAL */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">

          {/* IMAGEM */}
          <div>
            <div className="rounded-2xl overflow-hidden aspect-[3/4] relative" style={{ border: `1px solid ${CINZA}` }}>
              <img src={heroImg} alt="Calça Wide Leg Jeans Lumma FIT" className="w-full h-full object-cover object-top" fetchPriority="high" />
              {/* Badge flutuante */}
              <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest" style={{ background: GOLD, color: DARK }}>
                {PRODUTO.desconto}% OFF
              </div>
            </div>

            {/* Selos embaixo da foto */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { icon: ShieldCheck, label: 'Original', sub: '100% Garantido' },
                { icon: Truck,       label: 'Frete',    sub: 'Grátis' },
                { icon: Package,     label: 'Envio',    sub: 'Em 24h' },
              ].map((b, i) => (
                <div key={i} className="flex flex-col items-center gap-1 rounded-xl py-3 text-center" style={{ background: DARK3, border: `1px solid ${CINZA}` }}>
                  <b.icon className="w-4 h-4" style={{ color: GOLD }} />
                  <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: BRANCO }}>{b.label}</span>
                  <span className="text-[9px]" style={{ color: '#666' }}>{b.sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* OFERTA */}
          <div className="space-y-5">

            {/* OPÇÕES */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: '#666' }}>Escolha sua opção:</p>
              <div className="space-y-3">

                {/* 2 Calças — destaque */}
                {(() => {
                  const prod = PRODUTOS.find(p => p.id === 11)!;
                  const sel = selectedProdutoId === 11;
                  return (
                    <button onClick={() => setSelectedProdutoId(11)}
                      className="w-full text-left rounded-2xl transition-all relative overflow-hidden"
                      style={{ border: `2px solid ${sel ? GOLD : CINZA}`, background: sel ? `${GOLD}10` : DARK3, boxShadow: sel ? `0 0 24px ${GOLD}25` : 'none' }}>
                      <div className="flex items-center justify-between px-4 py-2" style={{ background: sel ? `linear-gradient(90deg, ${GOLD}, ${GOLD2})` : CINZA }}>
                        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: sel ? DARK : '#888' }}>
                          ★ MAIS VENDIDO · MELHOR PREÇO POR PEÇA
                        </span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: sel ? DARK : '#444', color: sel ? GOLD : '#aaa' }}>
                          77% OFF
                        </span>
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-black text-base" style={{ color: BRANCO }}>{prod.nome}</p>
                            <p className="text-xs mt-0.5" style={{ color: '#888' }}>{prod.descricao}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: '#16a34a20', color: '#4ade80', border: '1px solid #16a34a40' }}>
                                ✓ MELHOR CUSTO-BENEFÍCIO
                              </span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${GOLD}20`, color: GOLD, border: `1px solid ${GOLD}40` }}>
                                {prod.precoPorUnidade}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs line-through" style={{ color: '#555' }}>R$ {prod.precoAntigo.toFixed(2).replace('.', ',')}</p>
                            <p className="text-3xl font-black" style={{ color: GOLD }}>R$ {prod.preco.toFixed(2).replace('.', ',')}</p>
                          </div>
                        </div>
                        {sel && (
                          <div className="mt-3 flex items-center gap-1.5 text-xs font-black rounded-xl px-3 py-2" style={{ background: `${GOLD}15`, color: GOLD, border: `1px solid ${GOLD}30` }}>
                            <Check className="w-3.5 h-3.5" strokeWidth={3} /> Selecionado — melhor opção!
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })()}

                {/* 1 Calça */}
                {(() => {
                  const prod = PRODUTOS.find(p => p.id === 10)!;
                  const sel = selectedProdutoId === 10;
                  return (
                    <button onClick={() => setSelectedProdutoId(10)}
                      className="w-full text-left rounded-xl p-4 transition-all relative"
                      style={{ border: `1.5px solid ${sel ? GOLD : CINZA}`, background: sel ? `${GOLD}08` : DARK3 }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm" style={{ color: sel ? BRANCO : '#888' }}>{prod.nome}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#555' }}>{prod.microcopy}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] line-through" style={{ color: '#444' }}>R$ {prod.precoAntigo.toFixed(2).replace('.', ',')}</p>
                          <p className="text-xl font-black" style={{ color: sel ? GOLD : '#666' }}>R$ {prod.preco.toFixed(2).replace('.', ',')}</p>
                          <p className="text-[9px]" style={{ color: '#555' }}>{prod.precoPorUnidade}</p>
                        </div>
                      </div>
                      {sel && <Check className="absolute top-4 right-4 w-4 h-4" style={{ color: GOLD }} strokeWidth={3} />}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* TAMANHO */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#666' }}>Tamanho:</p>
                <button onClick={() => setShowSizeGuide(!showSizeGuide)} className="text-xs font-semibold underline" style={{ color: GOLD }}>
                  Guia de tamanhos
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {TAMANHOS.map((t) => (
                  <button key={t} onClick={() => setSelectedTamanho(t)}
                    className="py-3 rounded-xl font-black text-sm transition-all active:scale-95 border"
                    style={{
                      borderColor: selectedTamanho === t ? GOLD : CINZA,
                      backgroundColor: selectedTamanho === t ? GOLD : DARK3,
                      color: selectedTamanho === t ? DARK : '#888',
                    }}>
                    {t}
                  </button>
                ))}
              </div>
              {showSizeGuide && (
                <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: CINZA }}>
                  <div className="py-2 px-4 text-center text-xs font-black uppercase tracking-wider" style={{ background: GOLD, color: DARK }}>
                    Medidas corporais em centímetros
                  </div>
                  <table className="w-full text-xs" style={{ background: DARK3 }}>
                    <thead><tr style={{ background: CINZA }}>
                      <th className="py-2 px-3 text-left font-bold" style={{ color: '#888' }}>Tam.</th>
                      <th className="py-2 px-3 font-bold text-center" style={{ color: '#888' }}>Cintura</th>
                      <th className="py-2 px-3 font-bold text-center" style={{ color: '#888' }}>Altura calça</th>
                    </tr></thead>
                    <tbody>
                      {MEDIDAS.map((row) => (
                        <tr key={row.t} className="border-t" style={{ borderColor: CINZA, background: selectedTamanho === row.t ? `${GOLD}15` : 'transparent' }}>
                          <td className="py-2 px-3 font-black" style={{ color: GOLD }}>{row.t}</td>
                          <td className="py-2 px-3 text-center" style={{ color: '#aaa' }}>{row.c} cm</td>
                          <td className="py-2 px-3 text-center" style={{ color: '#aaa' }}>{row.alt} cm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* CORES */}
            <div className="rounded-xl p-4" style={{ background: DARK3, border: `1px solid ${CINZA}` }}>
              <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: '#666' }}>
                {PRODUTO.qtdCores === 2 ? 'Cor 1:' : 'Cor:'} <span style={{ color: GOLD }}>{COR.label}</span>
              </p>
              <div className="flex gap-3">
                {CORES.map((cor) => (
                  <button key={cor.id} onClick={() => setSelectedCorId(cor.id)} className="flex flex-col items-center gap-1.5">
                    <img src={cor.img} alt={cor.label} className="w-14 h-14 object-cover object-top rounded-xl border-2 transition-all"
                      style={{ borderColor: selectedCorId === cor.id ? GOLD : CINZA, boxShadow: selectedCorId === cor.id ? `0 0 0 2px ${GOLD}` : 'none' }} />
                    <span className="text-[9px] font-semibold" style={{ color: selectedCorId === cor.id ? GOLD : '#666' }}>{cor.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {PRODUTO.qtdCores === 2 && (
              <div className="rounded-xl p-4" style={{ background: DARK3, border: `1px solid ${CINZA}` }}>
                <p className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: '#666' }}>
                  Cor 2: <span style={{ color: GOLD }}>{COR2.label}</span>
                </p>
                <div className="flex gap-3">
                  {CORES.map((cor) => (
                    <button key={cor.id} onClick={() => setSelectedCor2Id(cor.id)} className="flex flex-col items-center gap-1.5">
                      <img src={cor.img} alt={cor.label} className="w-14 h-14 object-cover object-top rounded-xl border-2 transition-all"
                        style={{ borderColor: selectedCor2Id === cor.id ? GOLD : CINZA, boxShadow: selectedCor2Id === cor.id ? `0 0 0 2px ${GOLD}` : 'none' }} />
                      <span className="text-[9px] font-semibold" style={{ color: selectedCor2Id === cor.id ? GOLD : '#666' }}>{cor.label.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PREÇO */}
            <div className="rounded-2xl p-5" style={{ background: `linear-gradient(135deg, ${GOLD}18, ${DARK3})`, border: `1.5px solid ${GOLD}40` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm line-through" style={{ color: '#555' }}>De R$ {PRODUTO.precoAntigo.toFixed(2).replace('.', ',')}</span>
                <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: GOLD, color: DARK }}>{PRODUTO.desconto}% OFF</span>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-xl font-bold" style={{ color: GOLD }}>R$</span>
                <span className="text-7xl font-black" style={{ color: GOLD }}>{Math.floor(PRODUTO.preco)}</span>
                <span className="text-3xl font-bold" style={{ color: GOLD }}>,{PRODUTO.preco.toFixed(2).split('.')[1]}</span>
              </div>
              {PRODUTO.id === 11 && (
                <p className="text-xs font-black mb-2" style={{ color: `${GOLD}aa` }}>= R$ 29,95 por calça · menor preço por unidade</p>
              )}
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: `${DARK}80`, border: `1px solid ${CINZA}` }}>
                <img src={pixLogo} alt="Pix" className="h-7 w-7 bg-white rounded-full p-1 object-contain" />
                <div>
                  <p className="text-sm font-black" style={{ color: BRANCO }}>Preço exclusivo no Pix</p>
                  <p className="text-[10px]" style={{ color: '#666' }}>Aprovação imediata · envio em até 24h</p>
                </div>
              </div>
            </div>

            {/* URGÊNCIA */}
            <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: '#1a0f00', border: '1px solid #3d2000' }}>
              <Clock className="w-5 h-5 shrink-0" style={{ color: GOLD }} />
              <div>
                <p className="text-sm font-black" style={{ color: GOLD }}>Apenas {unitsLeft} unidades disponíveis</p>
                <p className="text-xs" style={{ color: '#666' }}>Oferta encerra em {mm}:{ss}</p>
              </div>
            </div>

            {/* BULLETS */}
            <ul className="space-y-2.5">
              {[
                'Cintura alta modeladora — define sem apertar',
                'Corte wide leg — alonga visualmente as pernas',
                'Jeans resistente, não amassa e não desbota',
                'Versátil: academia, trabalho, passeio e dia a dia',
                '4 cores disponíveis para combinar com tudo',
              ].map((t, i) => (
                <li key={i} className="flex items-center gap-3 text-sm" style={{ color: '#aaa' }}>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full shrink-0" style={{ background: `${GOLD}20`, border: `1px solid ${GOLD}50` }}>
                    <Check className="h-3 w-3" style={{ color: GOLD }} strokeWidth={3} />
                  </div>
                  {t}
                </li>
              ))}
            </ul>

            {/* CTA DESKTOP */}
            <div className="hidden lg:block space-y-3">
              <Button disabled={generating} onClick={() => handleBuyClick()}
                className="w-full py-7 text-lg font-black uppercase tracking-wider active:scale-[0.98] transition-transform rounded-2xl"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, color: DARK, fontFamily: 'Archivo Black, sans-serif', boxShadow: `0 8px 30px ${GOLD}40` }}>
                {generating
                  ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Gerando Pix...</>
                  : selectedProdutoId === 11
                  ? <span className="flex items-center gap-2">QUERO AS 2 CALÇAS — R$ 59,90 <ArrowRight className="w-5 h-5" /></span>
                  : <span className="flex items-center gap-2">QUERO MINHA CALÇA — R$ 39,90 <ArrowRight className="w-5 h-5" /></span>}
              </Button>
              <div className="flex items-center justify-center gap-4 text-[11px]" style={{ color: '#555' }}>
                <span className="flex items-center gap-1"><Lock className="w-3 h-3" style={{ color: '#4ade80' }} />Pagamento seguro</span>
                <span className="flex items-center gap-1"><Truck className="w-3 h-3" style={{ color: '#4ade80' }} />Frete grátis</span>
                <span className="flex items-center gap-1"><Package className="w-3 h-3" style={{ color: '#4ade80' }} />Envio com rastreio</span>
              </div>
            </div>
          </div>
        </div>

        {/* DIVIDER DOURADO */}
        <div className="flex items-center gap-4 mb-10">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}40)` }} />
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>★ DEPOIMENTOS ★</span>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${GOLD}40, transparent)` }} />
        </div>

        {/* REVIEWS */}
        <div className="mb-12">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />)}</div>
            <span className="font-black" style={{ color: BRANCO }}>4.9 / 5.0</span>
            <span style={{ color: '#666' }}>· 980 avaliações</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {REVIEWS.map((r, i) => (
              <div key={i} className="rounded-2xl p-5" style={{ background: DARK3, border: `1px solid ${CINZA}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex">{[...Array(r.rating)].map((_, j) => <Star key={j} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}</div>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: `${GOLD}20`, color: GOLD }}>✓ Verificada</span>
                </div>
                <p className="text-sm italic mb-3" style={{ color: '#aaa' }}>"{r.text}"</p>
                <div className="pt-3" style={{ borderTop: `1px solid ${CINZA}` }}>
                  <p className="text-sm font-bold" style={{ color: BRANCO }}>{r.name}</p>
                  <p className="text-[10px]" style={{ color: '#555' }}>{r.city}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* DIVIDER */}
        <div className="flex items-center gap-4 mb-10">
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}40)` }} />
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: GOLD }}>★ GARANTIA ★</span>
          <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${GOLD}40, transparent)` }} />
        </div>

        {/* COMPRA SEGURA */}
        <div className="mb-12 rounded-2xl p-6" style={{ background: DARK3, border: `1px solid ${CINZA}` }}>
          <h2 className="text-lg font-black text-center mb-5 flex items-center justify-center gap-2" style={{ color: GOLD }}>
            <ShieldCheck className="w-5 h-5" /> Compra 100% Segura e Garantida
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Truck,         titulo: 'Frete Grátis',    sub: 'Para todo o Brasil' },
              { icon: Package,       titulo: 'Envio Rastreado', sub: 'Acompanhe o pedido' },
              { icon: Zap,           titulo: 'Pix Aprovado',    sub: 'Na hora, sem espera' },
              { icon: MessageCircle, titulo: 'Suporte',         sub: 'Troca de tamanho' },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-center" style={{ background: DARK2, border: `1px solid ${CINZA}` }}>
                <item.icon className="w-6 h-6" style={{ color: GOLD }} />
                <p className="text-xs font-black" style={{ color: BRANCO }}>{item.titulo}</p>
                <p className="text-[10px]" style={{ color: '#555' }}>{item.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA FINAL */}
        <div className="mb-10 rounded-2xl overflow-hidden" style={{ border: `2px solid ${GOLD}50` }}>
          <div className="py-3 font-black text-sm flex items-center justify-center gap-2 tracking-widest uppercase" style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD2})`, color: DARK }}>
            ★ ÚLTIMAS {unitsLeft} UNIDADES · ENCERRA EM {mm}:{ss} ★
          </div>
          <div className="p-8 text-center" style={{ background: DARK2 }}>
            <h3 className="text-2xl font-black mb-2 tracking-tight" style={{ color: BRANCO }}>Garanta a sua agora</h3>
            <p className="text-sm mb-8" style={{ color: '#666' }}>Frete grátis · Pix aprovado na hora · Envio em 24h</p>
            <div className="flex flex-col gap-3 max-w-sm mx-auto">
              <Button disabled={generating} onClick={() => { setSelectedProdutoId(11); handleBuyClick(11); }}
                className="w-full py-6 text-base font-black uppercase tracking-wider rounded-2xl"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, color: DARK, boxShadow: `0 6px 24px ${GOLD}40` }}>
                🏆 2 CALÇAS — R$ 59,90 · R$ 29,95/unid.
              </Button>
              <button disabled={generating} onClick={() => { setSelectedProdutoId(10); handleBuyClick(10); }}
                className="w-full py-2 text-xs font-semibold transition-colors" style={{ color: '#555' }}>
                ou 1 calça por R$ 39,90
              </button>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-10">
          <h2 className="text-xl font-black text-center mb-6 tracking-tight" style={{ color: BRANCO }}>Perguntas Frequentes</h2>
          <div className="space-y-2 max-w-2xl mx-auto">
            {[
              { q: 'Como escolho o tamanho certo?', a: 'Meça sua cintura e consulte nossa tabela de medidas. Em caso de dúvida entre dois tamanhos, escolha o maior.' },
              { q: 'O jeans é de qualidade?', a: 'Sim! Tecido denim resistente com boa elasticidade. Não amassa, não desbota e mantém o caimento após várias lavagens.' },
              { q: 'Em quanto tempo chega?', a: 'Despachamos em até 24h após confirmação do Pix. Entrega em 3 a 7 dias úteis com rastreamento.' },
              { q: 'Posso trocar o tamanho?', a: 'Sim. Se chegar diferente do descrito ou com defeito, entre em contato pelo WhatsApp em até 7 dias.' },
              { q: 'O frete é grátis mesmo?', a: 'Sim, 100% grátis para todos os estados do Brasil, sem exceção.' },
            ].map((f, i) => (
              <details key={i} className="rounded-xl p-4 group" style={{ background: DARK3, border: `1px solid ${CINZA}` }}>
                <summary className="font-bold list-none flex items-center justify-between text-sm cursor-pointer" style={{ color: BRANCO }}>
                  {f.q}
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 shrink-0 ml-2" style={{ color: GOLD }} />
                </summary>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: '#888' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="text-center py-8 text-xs" style={{ background: DARK2, color: '#444', borderTop: `1px solid ${CINZA}` }}>
        <p className="font-black text-lg mb-1" style={{ color: GOLD }}>Lumma FIT</p>
        <p style={{ color: '#444' }}>© 2026 Lumma FIT · Moda Feminina · Compra 100% segura</p>
      </footer>

      {/* MOBILE CTA FIXO */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50" style={{ boxShadow: `0 -8px 30px ${GOLD}20` }}>
        <div className="py-1.5 px-4 text-center text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2" style={{ background: DARK, color: GOLD }}>
          <Clock className="w-3 h-3" /> Expira em <strong style={{ color: GOLD }}>{mm}:{ss}</strong> · {unitsLeft} unidades
        </div>
        <div className="p-3" style={{ background: DARK2, borderTop: `1px solid ${CINZA}` }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: GOLD }}>{PRODUTO.descricao}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs line-through" style={{ color: '#444' }}>R$ {PRODUTO.precoAntigo.toFixed(2).replace('.', ',')}</span>
                <span className="text-2xl font-black" style={{ color: GOLD }}>R$ {PRODUTO.preco.toFixed(2).replace('.', ',')}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: GOLD, color: DARK }}>-{PRODUTO.desconto}%</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px]" style={{ color: '#555' }}>Frete grátis</p>
              <p className="text-[9px]" style={{ color: GOLD }}>{PRODUTO.precoPorUnidade}</p>
            </div>
          </div>
          <Button disabled={generating} onClick={() => handleBuyClick()}
            className="w-full py-5 text-base font-black uppercase tracking-wide active:scale-[0.98] rounded-xl"
            style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})`, color: DARK, boxShadow: `0 4px 20px ${GOLD}40` }}>
            {generating
              ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Gerando Pix...</>
              : selectedProdutoId === 11 ? 'QUERO AS 2 CALÇAS AGORA' : 'GARANTIR MINHA CALÇA'}
          </Button>
          <p className="text-center text-[10px] mt-1.5" style={{ color: '#444' }}>Pagamento seguro • Frete grátis • Envio com rastreio</p>
        </div>
      </div>

      <CheckoutForm open={formOpen} onOpenChange={setFormOpen} onConfirm={handleFormConfirm}
        headerEyebrow="👗 Lumma FIT" title={PRODUTO.nome} description={getVariacao()}
        submitLabel="CONTINUAR PARA O PAGAMENTO →" primaryColor={DARK} accentColor={GOLD} />
      <OrderReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} product={reviewProduct}
        onPay={handleCreatePixPayment} onApproved={handlePixApproved}
        headerEyebrow="👗 Lumma FIT" title={PRODUTO.nome} description={getVariacao()}
        primaryColor={DARK} accentColor={GOLD}
        payButtonLabel={(total) => `💳 Pagar R$ ${total} com Pix`} />
    </div>
  );
}
