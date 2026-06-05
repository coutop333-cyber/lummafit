import { Resend } from 'resend';

const FROM = 'Eletros Jundiaí <suporte@eletrojundiai.shop>';
const WHATSAPP_URL = 'https://wa.me/5511999999999';

export interface SendCustomEmailParams {
  emailCliente: string;
  nomeCliente?: string | null;
  codigoPedido?: string | null;
  subject: string;
  message: string; // texto simples (preserva quebras de linha)
}

export interface SendCustomEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendCustomEmail(
  params: SendCustomEmailParams,
): Promise<SendCustomEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[sendCustomEmail] RESEND_API_KEY ausente');
    return { ok: false, error: 'RESEND_API_KEY missing' };
  }

  const { emailCliente, nomeCliente, codigoPedido, subject, message } = params;

  if (!emailCliente || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCliente)) {
    return { ok: false, error: 'invalid recipient email' };
  }
  if (!subject?.trim() || !message?.trim()) {
    return { ok: false, error: 'subject and message required' };
  }

  const resend = new Resend(apiKey);

  const trackBlock = codigoPedido
    ? `<div style="background:#fdf6f8;border:1px solid #f3d6e1;border-radius:12px;padding:16px 18px;margin:18px 0;text-align:center;">
        <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Seu pedido</div>
        <div style="font-size:16px;font-weight:700;color:#c83f70;font-family:'Courier New',monospace;word-break:break-all;margin-bottom:12px;">${escapeHtml(codigoPedido)}</div>
        <a href="https://eletrojundiai.shop/rastreio/${encodeURIComponent(codigoPedido)}"
           style="display:inline-block;background:linear-gradient(135deg,#c83f70 0%,#e85a8a 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">
          📦 Acompanhar pedido
        </a>
      </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#fdf6f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border-radius:16px;box-shadow:0 4px 20px rgba(200,63,112,0.08);overflow:hidden;">
      <div style="background:linear-gradient(135deg,#c83f70 0%,#e85a8a 100%);padding:28px 24px;text-align:center;color:#fff;">
        <h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.3px;">${escapeHtml(subject)}</h1>
        ${nomeCliente ? `<p style="margin:8px 0 0;font-size:14px;opacity:0.95;">Olá ${escapeHtml(nomeCliente)} 💖</p>` : ''}
      </div>

      <div style="padding:24px;">
        <div style="font-size:15px;line-height:1.7;color:#333;white-space:pre-wrap;">${escapeHtml(message)}</div>
        ${trackBlock}
      </div>

      <div style="background:#fafafa;padding:18px 24px;text-align:center;border-top:1px solid #f0f0f0;">
        <p style="margin:0 0 10px;font-size:13px;color:#666;">Precisa de ajuda?</p>
        <a href="${WHATSAPP_URL}"
           style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 22px;border-radius:8px;">
          💬 Falar no WhatsApp
        </a>
      </div>

      <div style="padding:14px 24px;text-align:center;font-size:11px;color:#aaa;">
        © ${new Date().getFullYear()} Eletros Jundiaí · suporte@eletrojundiai.shop
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = [
    subject,
    nomeCliente ? `Olá ${nomeCliente},` : '',
    message,
    codigoPedido
      ? `Acompanhar pedido: https://eletrojundiai.shop/rastreio/${codigoPedido}`
      : '',
    `Suporte WhatsApp: ${WHATSAPP_URL}`,
    `— Eletros Jundiaí`,
  ]
    .filter(Boolean)
    .join('\n\n');

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
      console.error('[sendCustomEmail] Resend erro', error);
      return { ok: false, error: String((error as any)?.message || error) };
    }
    return { ok: true, id: data?.id };
  } catch (err: any) {
    console.error('[sendCustomEmail] exceção', err);
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
