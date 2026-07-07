import nodemailer from 'nodemailer';

// Servidor SMTP do UOL HOST (E-mail Profissional / domínio próprio).
// IMPORTANTE: para contas @uol.com.br pessoais o servidor é smtps.uol.com.br,
// mas para domínio próprio (E-mail Profissional / UOL Host, como
// carsantcontabilidade.com.br) o servidor correto é smtps.uhserver.com.
const SMTP_HOST = process.env.SMTP_HOST || 'smtps.uhserver.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);

function buildTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true para 465 (SSL), false para 587 (STARTTLS)
    requireTLS: SMTP_PORT !== 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { to, subject, text, html, attachmentBase64, attachmentFilename } = req.body || {};

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

    const attachments = attachmentBase64
      ? [{
          filename: attachmentFilename || 'anexo.pdf',
          content: Buffer.from(attachmentBase64, 'base64'),
        }]
      : undefined;

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
