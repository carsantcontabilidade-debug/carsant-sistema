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

// O SMTP só entrega: a cópia na pasta "Enviados" do UOL precisa ser gravada à
// parte, por IMAP. Falha aqui nunca derruba o envio — vira só um aviso.
const PASTAS_ENVIADOS = ['Enviados', 'Sent', 'INBOX.Sent', 'Itens Enviados', 'Sent Items', 'INBOX.Enviados'];

async function salvarCopiaEnviados(mail, info) {
  let client;
  const tarefa = (async () => {
    const { ImapFlow } = await import('imapflow');
    const { default: MailComposer } = await import('nodemailer/lib/mail-composer/index.js');
    const raw = await new MailComposer({ ...mail, messageId: info.messageId, date: new Date() }).compile().build();
    client = new ImapFlow({
      host: process.env.IMAP_HOST || 'imap.uhserver.com',
      port: Number(process.env.IMAP_PORT || 993),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      logger: false,
    });
    await client.connect();
    const pastas = await client.list();
    const pasta = pastas.find((p) => p.specialUse === '\\Sent')?.path
      || PASTAS_ENVIADOS.find((n) => pastas.some((p) => p.path === n));
    if (!pasta) throw new Error('pasta Enviados não encontrada (' + pastas.map((p) => p.path).join(', ') + ')');
    await client.append(pasta, raw, ['\\Seen']);
    await client.logout();
    return { ok: true, pasta };
  })();
  const limite = new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado ao gravar em Enviados')), 15000));
  try {
    return await Promise.race([tarefa, limite]);
  } catch (e) {
    try { client?.close(); } catch { /* ignora */ }
    console.warn('Cópia em Enviados do UOL não gravada:', e.message);
    return { ok: false, erro: e.message };
  }
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
  const mail = {
    from: `"CARSANT Contabilidade" <${process.env.SMTP_USER}>`,
    replyTo: replyTo || undefined,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
    attachments: attachments || undefined,
  };
  const info = await transporter.sendMail(mail);
  info.copia = await salvarCopiaEnviados(mail, info);
  return info;
}

// E-mail ao cliente em nome da CARSANT: tenta o UOL (atendimento@) e, se
// recusar, cai no Gmail com o mesmo remetente. Devolve por onde saiu.
export const EMAIL_ATENDIMENTO = 'atendimento@carsantcontabilidade.com.br';

export async function enviarEmailInstitucional({ to, subject, text, html, attachments }) {
  let motivoFallback;
  if (uolConfigurado()) {
    try {
      const info = await enviarEmailUol({ to, subject, text, html, attachments, replyTo: EMAIL_ATENDIMENTO });
      return { info, via: 'uol' };
    } catch (errUol) {
      motivoFallback = errUol.message;
      console.warn('SMTP do UOL falhou, usando o Gmail:', errUol.message);
    }
  }
  const info = await enviarEmailTransacional({ to, subject, text, html, attachments, from: EMAIL_ATENDIMENTO, replyTo: EMAIL_ATENDIMENTO });
  return { info, via: 'gmail', motivoFallback };
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
