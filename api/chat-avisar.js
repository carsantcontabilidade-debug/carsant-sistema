import { createClient } from '@supabase/supabase-js';
import { enviarEmailTransacional } from './_mailer.js';

// Avisa a equipe por e-mail quando o cliente manda uma mensagem no chat
// (Portal → escritório). O caminho inverso (escritório → cliente) usa o
// push já existente (api/portal-notify.js), chamado direto por
// Comunicacao.jsx — aqui só cobre esta direção, que não tinha aviso
// nenhum. Destinatário: responsável atual da conversa; se não houver,
// todos do setor; se o setor não tiver ninguém, o(s) gestor(es).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { conversaId } = req.body || {};
  if (!conversaId) {
    return res.status(400).json({ error: 'Campo "conversaId" é obrigatório.' });
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

  const { data: conversa } = await admin
    .from('chat_conversas')
    .select('id, assunto, setor, responsavel_atual_id, clientes(nome)')
    .eq('id', conversaId)
    .single();
  if (!conversa) {
    return res.status(404).json({ error: 'Conversa não encontrada.' });
  }

  let destinatarios = [];

  if (conversa.responsavel_atual_id) {
    const { data: resp } = await admin.from('profiles').select('email').eq('id', conversa.responsavel_atual_id).maybeSingle();
    if (resp?.email) destinatarios = [resp.email];
  }

  if (destinatarios.length === 0) {
    const { data: doSetor } = await admin.from('profiles').select('email').eq('setor', conversa.setor).not('email', 'is', null);
    destinatarios = (doSetor || []).map((p) => p.email).filter(Boolean);
  }

  if (destinatarios.length === 0) {
    const { data: gestores } = await admin.from('profiles').select('email').eq('role', 'gestor').not('email', 'is', null);
    destinatarios = (gestores || []).map((p) => p.email).filter(Boolean);
  }

  if (destinatarios.length === 0) {
    return res.status(200).json({ enviados: 0, motivo: 'nenhum destinatário encontrado' });
  }

  const origin = req.headers.origin || '';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#1F4788;">CARSANT Contabilidade</h2>
      <p><strong>${conversa.clientes?.nome || 'Um cliente'}</strong> enviou uma nova mensagem no chat.</p>
      <p style="color:#555;">Assunto: ${conversa.assunto}</p>
      <p style="text-align:center; margin: 24px 0;">
        <a href="${origin}/comunicacao?conversa=${conversaId}" style="background:#1F4788; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">
          Abrir conversa
        </a>
      </p>
    </div>
  `;

  try {
    await enviarEmailTransacional({
      to: destinatarios.join(','),
      subject: `CARSANT — Nova mensagem de ${conversa.clientes?.nome || 'cliente'} no chat`,
      html,
    });
  } catch (err) {
    return res.status(502).json({ error: `Falha ao enviar aviso: ${err.message}` });
  }

  return res.status(200).json({ enviados: destinatarios.length });
}
