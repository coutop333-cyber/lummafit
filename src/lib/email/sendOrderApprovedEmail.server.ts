import { Resend } from 'resend';

const FROM = 'Eletros Jundiaí <suporte@eletrojundiai.shop>';
const WHATSAPP_URL = 'https://wa.me/5511999999999';

export interface SendOrderApprovedEmailParams {
  nomeCliente: string;
  emailCliente: string;
  codigoPedido: string;
  linkRastreio?: string;
}

export interface SendOrderApprovedEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendOrderApprovedEmail(
  params: SendOrderApprovedEmailParams,
): Promise<SendOrderApprovedEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[sendOrderApprovedEmail] RESEND_API_KEY não configurada');
    return { ok: false, error: 'RESEND_API_KEY missing' };
  }

  const { nomeCliente, emailCliente, codigoPedido, linkRastreio } = params;

  if (!emailCliente || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCliente)) {
    return { ok: false, error: 'invalid recipient email' };
  }

  const resend = new Resend(apiKey);
  const subject = 'Pagamento aprovado ✅ Pedido confirmado';
  const trackHref = linkRastreio || '#';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#fdf6f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border-radius:16px;box-shadow:0 4px 20px rgba(200,63,112,0.08);overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c83f70 0%,#e85a8a 100%);padding:32px 24px 24px;text-align:center;color:#fff;">
        <div style="font-size:46px;line-height:1;margin-bottom:12px;">✅</div>
        <h1 style="margin:0 0 6px;font-size:26px;font-weight:800;letter-spacing:-0.3px;">Pagamento aprovado!</h1>
        <p style="margin:0;font-size:15px;opacity:0.95;">Obrigada pela sua compra, ${escapeHtml(nomeCliente || 'cliente')} 💖</p>
      </div>

      <!-- CTA destacado, logo abaixo do título -->
      <div style="padding:24px 20px 8px;text-align:center;">
        <a href="${escapeAttr(trackHref)}"
           style="display:block;width:100%;box-sizing:border-box;background:linear-gradient(135deg,#c83f70 0%,#e85a8a 100%);color:#ffffff;text-decoration:none;font-weight:800;font-size:17px;padding:20px 24px;border-radius:14px;text-transform:uppercase;letter-spacing:0.6px;box-shadow:0 8px 20px rgba(200,63,112,0.35);text-align:center;">
          📦 Acompanhar Pedido
        </a>
        <p style="margin:12px 0 0;font-size:13px;color:#888;line-height:1.5;">
          Acompanhe atualizações do seu pedido em tempo real.
        </p>
      </div>

      <div style="padding:20px 24px 28px;">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;text-align:center;">
          Seu pedido foi confirmado e já está sendo preparado com todo carinho.
        </p>

        <div style="background:#fdf6f8;border:1px solid #f3d6e1;border-radius:12px;padding:16px 18px;margin:18px 0 0;">
          <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Código do pedido</div>
          <div style="font-size:18px;font-weight:700;color:#c83f70;font-family:'Courier New',monospace;word-break:break-all;">${escapeHtml(codigoPedido)}</div>
        </div>

        <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#777;text-align:center;">
          Você receberá o código de rastreio assim que o pedido for postado.
        </p>
      </div>

      <div style="background:#fafafa;padding:20px 24px;text-align:center;border-top:1px solid #f0f0f0;">
        <p style="margin:0 0 12px;font-size:13px;color:#666;">Precisa de ajuda?</p>
        <a href="${WHATSAPP_URL}"
           style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">
          💬 Falar no WhatsApp
        </a>
      </div>

      <div style="padding:16px 24px;text-align:center;font-size:11px;color:#aaa;">
        © ${new Date().getFullYear()} Eletros Jundiaí · suporte@eletrojundiai.shop
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Pagamento aprovado!`,
    `Olá ${nomeCliente || 'cliente'},`,
    `Seu pedido foi confirmado.`,
    `Código do pedido: ${codigoPedido}`,
    linkRastreio ? `Acompanhe seu pedido: ${linkRastreio}` : '',
    `Suporte WhatsApp: ${WHATSAPP_URL}`,
    `— Eletros Jundiaí`,
  ].filter(Boolean).join('\n\n');

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [emailCliente],
      subject,
      html,
      text,
      replyTo: 'suporte@eletrojundiai.shop',
    });

    if (error) {
      console.error('[sendOrderApprovedEmail] erro Resend', error);
      return { ok: false, error: String((error as any)?.message || error) };
    }

    console.log('[sendOrderApprovedEmail][OK]', { id: data?.id, to: emailCliente, codigoPedido });
    return { ok: true, id: data?.id };
  } catch (err: any) {
    console.error('[sendOrderApprovedEmail] exceção', err);
    return { ok: false, error: err?.message || String(err) };
  }
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
