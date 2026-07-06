import nodemailer from 'nodemailer';

// Servidor SMTP da UOL (hospedagem de e-mail profissional / carsantcontabilidade.com.br).
// Host e porta padrão da UOL: smtps.uol.com.br, porta 587 (STARTTLS).
const SMTP_HOST = process.env.SMTP_HOST || 'smtps.uol.com.br';
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

  const { to, subject, text, html } = req.body || {};

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

    const info = await transporter.sendMail({
      from: `"CARSANT Contabilidade" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
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
