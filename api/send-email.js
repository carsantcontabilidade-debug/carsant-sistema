import { buildTransport } from './_mailer.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { to, subject, text, html, attachmentBase64, attachmentFilename, attachments: attachmentsExtras } = req.body || {};

  if (!to || !subject || (!text && !html)) {
    return res.status(400).json({ error: 'Campos obrigatórios: to, subject e text ou html' });
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(500).json({
      error: 'Credenciais de SMTP não configuradas no servidor (SMTP_USER / SMTP_PASS)',
    });
  }

  try {
    const transporter = buildTransport();

    // attachmentBase64/attachmentFilename: anexo único (compatibilidade com o
    // fluxo já existente do boleto). attachments: lista extra, cada item com
    // { contentBase64, filename, cid? } — cid permite referenciar a imagem
    // inline no HTML via <img src="cid:...">.
    const attachments = [
      ...(attachmentBase64 ? [{ filename: attachmentFilename || 'anexo.pdf', content: Buffer.from(attachmentBase64, 'base64') }] : []),
      ...(Array.isArray(attachmentsExtras) ? attachmentsExtras.map((a) => ({
        filename: a.filename || 'anexo',
        content: Buffer.from(a.contentBase64, 'base64'),
        ...(a.cid ? { cid: a.cid } : {}),
      })) : []),
    ];

    const info = await transporter.sendMail({
      from: `"CARSANT Contabilidade" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
      attachments,
    });

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Erro ao enviar e-mail via SMTP UOL:', error);
    return res.status(502).json({
      error: 'Falha ao enviar e-mail',
      detail: error.message,
    });
  }
}
