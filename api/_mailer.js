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

// SMTP do UOL Host (caixa atendimento@, SMTP_USER/SMTP_PASS). Tentado primeiro
// no envio de cobrança/nota: sai direto do domínio, com o SPF do UOL a favor.
// Já recusou conexões vindas da Vercel (554 5.7.1), por isso send-email.js cai
// no Gmail quando falha. Timeouts curtos para o fallback não estourar o limite.
export function uolConfigurado() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function enviarEmailUol({ to, subject, text, html, attachments, replyTo }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtps.uhserver.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    requireTLS: Number(process.env.SMTP_PORT || 587) !== 465,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 40000,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter.sendMail({
    from: `"CARSANT Contabilidade" <${process.env.SMTP_USER}>`,
    replyTo: replyTo || undefined,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
    attachments: attachments || undefined,
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
