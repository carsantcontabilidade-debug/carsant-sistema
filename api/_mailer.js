import nodemailer from 'nodemailer';

// Servidor SMTP do UOL HOST (E-mail Profissional / domínio próprio) — conta
// atendimento@carsantcontabilidade.com.br (SMTP_USER/SMTP_PASS). Usado só
// por send-email.js (cobrança/nota fiscal enviadas ao cliente), pra que o
// e-mail chegue com o remetente do escritório; os e-mails automáticos do
// sistema (convites, aviso de chat, backup) continuam pelo Gmail abaixo.
const SMTP_HOST = process.env.SMTP_HOST || 'smtps.uhserver.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);

export function buildTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    requireTLS: SMTP_PORT !== 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function enviarEmail({ to, subject, text, html }) {
  const transporter = buildTransport();
  return transporter.sendMail({
    from: `"CARSANT Contabilidade" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  });
}

// SMTP dedicado para e-mails transacionais do Portal do Cliente
// (convite/notificação) — o SMTP do UOL Host (usado nos boletos acima)
// se mostrou pouco confiável para esse fluxo especificamente, rejeitando
// entregas repetidas vezes mesmo em uso normal (não só em rajada de teste).
// Usa a conta Gmail já existente da CARSANT, via senha de app.
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
