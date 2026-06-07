import { Resend } from 'resend';

export async function sendTrackingEmail({
  nomeCliente,
  emailCliente,
  codigoPedido,
  statusAtual,
  observacao,
  codigoRastreio,
  linkRastreio,
}: {
  nomeCliente: string;
  emailCliente: string;
  codigoPedido: string;
  statusAtual: string;
  observacao?: string;
  codigoRastreio?: string;
  linkRastreio: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[sendTrackingEmail] RESEND_API_KEY não configurada');
    return { ok: false, error: 'RESEND_API_KEY não configurada' };
  }

  const resend = new Resend(apiKey);
  const nome = nomeCliente?.trim() || 'Cliente';

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atualização do seu pedido — Lumma FIT</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:1px;">LUMMA FIT</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Atualização do seu pedido</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;color:#333;font-size:16px;">Olá, <strong>${nome}</strong>! 👋</p>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
                Seu pedido teve uma atualização de status. Veja abaixo o que aconteceu:
              </p>

              <!-- Status box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9ff;border:1px solid #e0e4ff;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Status atual</p>
                    <p style="margin:0;font-size:18px;font-weight:700;color:#1a1a2e;">📦 ${statusAtual}</p>
                    ${observacao ? `<p style="margin:8px 0 0;font-size:14px;color:#666;">${observacao}</p>` : ''}
                  </td>
                </tr>
              </table>

              ${codigoRastreio ? `
              <!-- Código de rastreio -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Código de rastreio (Correios)</p>
                    <p style="margin:0;font-size:18px;font-weight:700;color:#1a1a2e;letter-spacing:2px;">${codigoRastreio}</p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Pedido -->
              <p style="margin:0 0 4px;font-size:12px;color:#999;">Código do pedido: <strong>${codigoPedido}</strong></p>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                <tr>
                  <td align="center">
                    <a href="${linkRastreio}" style="display:inline-block;background:#1a1a2e;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.5px;">
                      🔍 Acompanhar Pedido
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f8f8;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
              <p style="margin:0;font-size:12px;color:#aaa;">Lumma FIT · Se tiver dúvidas, responda este e-mail.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Lumma FIT <pedidos@lummafit.com>',
      to: [emailCliente],
      subject: `📦 Atualização do seu pedido — ${statusAtual}`,
      html,
    });

    if (error) {
      console.error('[sendTrackingEmail] Resend error', error);
      return { ok: false, error: String(error) };
    }

    return { ok: true };
  } catch (err) {
    console.error('[sendTrackingEmail] exceção', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
