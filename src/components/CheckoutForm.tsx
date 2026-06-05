import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ShieldCheck, Lock } from 'lucide-react';
import mercadoPagoLogo from '@/assets/mercado-pago.png';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (data: FormData) => void;
  title?: string;
  description?: string;
  submitLabel?: string;
  primaryColor?: string;
  accentColor?: string;
  headerEyebrow?: string;
}

interface FormData {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  cep: string;
  estado: string;
  cidade: string;
  endereco: string;
  numero: string;
  bairro: string;
}

const initial: FormData = { nome: '', email: '', telefone: '', cpf: '', cep: '', estado: '', cidade: '', endereco: '', numero: '', bairro: '' };

const maskCep = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
const maskCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};
const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '');
};

export function CheckoutForm({
  open,
  onOpenChange,
  onConfirm,
  title = 'Dados de Entrega',
  description = 'Preencha seus dados para enviarmos seu pedido.',
  submitLabel = 'Confirmar Dados de Entrega',
  primaryColor = '#0c2340',
  accentColor,
  headerEyebrow,
}: Props) {
  const [data, setData] = useState<FormData>(initial);
  const [loadingCep, setLoadingCep] = useState(false);

  const update = (k: keyof FormData, v: string) => setData((p) => ({ ...p, [k]: v }));

  const handleCepBlur = async () => {
    const clean = data.cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const json = await res.json();
      if (json.erro) {
        toast.error('CEP não encontrado');
      } else {
        setData((p) => ({
          ...p,
          estado: json.uf || p.estado,
          cidade: json.localidade || p.cidade,
          endereco: json.logradouro || p.endereco,
          bairro: json.bairro || p.bairro,
        }));
      }
    } catch {
      toast.error('Erro ao buscar CEP');
    } finally {
      setLoadingCep(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim());
    const cpfDigits = data.cpf.replace(/\D/g, '');
    if (!data.nome.trim() || !data.email.trim() || !data.telefone.trim() || !data.cpf.trim() || !data.cep.trim() || !data.endereco.trim() || !data.numero.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (!emailOk) {
      toast.error('Informe um e-mail válido');
      return;
    }
    if (cpfDigits.length !== 11) {
      toast.error('Informe um CPF válido com 11 dígitos');
      return;
    }
    onConfirm({ ...data, email: data.email.trim().toLowerCase() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" style={accentColor ? { borderTop: `5px solid ${accentColor}` } : undefined}>
        <DialogHeader>
          {headerEyebrow && (
            <span
              className="inline-block self-start text-[10px] font-extrabold uppercase tracking-widest px-2 py-1 rounded-md mb-1"
              style={{ backgroundColor: accentColor || primaryColor, color: accentColor ? primaryColor : '#ffffff' }}
            >
              {headerEyebrow}
            </span>
          )}
          <DialogTitle className="text-2xl font-bold" style={{ fontFamily: 'Archivo Black, sans-serif', color: primaryColor }}>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="mt-3 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#17a34a] text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-tight" style={{ fontFamily: 'Archivo Black, sans-serif', color: primaryColor }}>Compra 100% Segura</p>
            <p className="text-[11px] text-gray-600 flex items-center gap-1 mt-0.5">
              <Lock className="h-3 w-3" /> Seus dados são criptografados e protegidos
            </p>
          </div>
          <span className="hidden sm:inline-flex shrink-0 items-center rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border border-gray-200" style={{ color: primaryColor }}>SSL</span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/50 to-white p-4 shadow-sm">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#009ee3] text-white">
                <ShieldCheck className="h-3 w-3" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#009ee3]">Checkout Protegido</span>
            </div>
            <p className="text-[14px] font-black text-[#0c2340] mt-1" style={{ fontFamily: 'Archivo Black, sans-serif' }}>Pague via Mercado Pago</p>
            <p className="text-[10px] text-gray-500 leading-tight">Criptografia SSL de ponta a ponta. <br/> Seu pagamento é processado instantaneamente.</p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1">
            <div className="flex items-center justify-center rounded-xl bg-white border border-blue-50 p-2.5 shadow-sm">
              <img src={mercadoPagoLogo} alt="Mercado Pago" className="h-8 w-auto" />
            </div>
            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Parceiro Oficial</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label htmlFor="nome">Nome Completo</Label>
            <Input id="nome" value={data.nome} onChange={(e) => update('nome', e.target.value)} placeholder="Ex: Maya Chen" maxLength={100} required />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={data.email} onChange={(e) => update('email', e.target.value)} placeholder="voce@email.com" maxLength={120} required />
          </div>
          <div>
            <Label htmlFor="telefone">Telefone / WhatsApp</Label>
            <Input id="telefone" value={data.telefone} onChange={(e) => update('telefone', maskPhone(e.target.value))} placeholder="(11) 99999-9999" required />
          </div>
          <div>
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" value={data.cpf} onChange={(e) => update('cpf', maskCpf(e.target.value))} placeholder="000.000.000-00" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cep">CEP</Label>
              <Input id="cep" value={data.cep} onChange={(e) => update('cep', maskCep(e.target.value))} onBlur={handleCepBlur} placeholder="00000-000" required />
              {loadingCep && <p className="text-xs text-muted-foreground mt-1">Buscando endereço...</p>}
            </div>
            <div>
              <Label htmlFor="estado">Estado (UF)</Label>
              <Input id="estado" value={data.estado} onChange={(e) => update('estado', e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" maxLength={2} required />
            </div>
          </div>
          <div>
            <Label htmlFor="cidade">Cidade</Label>
            <Input id="cidade" value={data.cidade} onChange={(e) => update('cidade', e.target.value)} placeholder="São Paulo" required />
          </div>
          <div>
            <Label htmlFor="endereco">Endereço (Rua/Avenida)</Label>
            <Input id="endereco" value={data.endereco} onChange={(e) => update('endereco', e.target.value)} placeholder="Avenida Paulista" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="numero">Número</Label>
              <Input id="numero" value={data.numero} onChange={(e) => update('numero', e.target.value)} placeholder="1000" required />
            </div>
            <div>
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" value={data.bairro} onChange={(e) => update('bairro', e.target.value)} placeholder="Bela Vista" required />
            </div>
          </div>
          <Button type="submit" className="w-full py-6 text-base font-bold uppercase tracking-wide mt-2" style={{ backgroundColor: primaryColor }}>
            {submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
