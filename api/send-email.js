import { createClient } from '@supabase/supabase-js';
import { buildTransport } from './_mailer.js';

// Envia e-mail em nome da CARSANT via SMTP próprio — usado por telas
// internas (Cobrancas, Notas Fiscais, Atendimento) pra mandar boleto/nota
// pro cliente. Precisa ser gestor/colaborador autenticado: sem essa
// checagem (corrigida em 2026-07-29, revisão de segurança), qualquer um na
// internet podia usar este endpoint como um relay de e-mail em nome da
// CARSANT, inclusive com anexo — o vetor exato de golpe que o Ronaldo
// descreveu (mandar "boleto" falso pra cliente parecendo vir do escritório).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: perfil } = await admin.from('profiles').select('role').eq('id', userData.user.id).single();
  if (!perfil) {
    return res.status(403).json({ error: 'Apenas a equipe pode enviar e-mail pelo sistema.' });
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
