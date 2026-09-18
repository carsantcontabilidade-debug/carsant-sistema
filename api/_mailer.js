import nodemailer from 'nodemailer';

// SMTP usado para todo e-mail enviado pelo sistema (boleto/cobrança, nota
// fiscal, convite/notificação do Portal do Cliente, aviso de chat, backup)
// — a conta Gmail já existente da CARSANT, via senha de app. Antes existia
// um segundo transporte via SMTP do UOL Host, mas ele se mostrou pouco
// confiável (rejeitava entregas com "554 5.7.1 Rejected for policy reason"
// mesmo em uso normal, não só em rajada de teste) e foi removido em favor
// deste único transporte pra todos os fluxos.
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

export async function enviarEmailTransacional({ to, subject, text, html, attachments }) {
  const transporter = buildTransportTransacional();
  return transporter.sendMail({
    from: `"CARSANT Contabilidade" <${process.env.TRANSACTIONAL_SMTP_USER}>`,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
    attachments: attachments || undefined,
  });
}
