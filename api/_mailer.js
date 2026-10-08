import nodemailer from 'nodemailer';

// SMTP único do sistema: a conta Gmail da CARSANT, via senha de app. O SMTP
// do UOL Host (atendimento@) foi descartado — recusa entregas com
// "554 5.7.1 Rejected for policy reason", de novo em 2026-10-08.
function buildTransportTransacional() {
  return nodemailer.createTransport({
    host: process.env.TRANSACTIONAL_SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.TRANSACTIONAL_SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.TRANSACTIONAL_SMTP_USER,
      pass: process.env.TRANSACTIONAL_SMTP_PASS,
    },
  });
}

// `from`/`replyTo` opcionais: o Gmail só mantém um remetente diferente da
// conta autenticada se ele estiver cadastrado como "Enviar e-mail como" nas
// configurações do Gmail; senão troca por conta própria pelo endereço do Gmail.
export async function enviarEmailTransacional({ to, subject, text, html, attachments, from, replyTo }) {
  const transporter = buildTransportTransacional();
  return transporter.sendMail({
    from: `"CARSANT Contabilidade" <${from || process.env.TRANSACTIONAL_SMTP_USER}>`,
    replyTo: replyTo || undefined,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
    attachments: attachments || undefined,
  });
}
