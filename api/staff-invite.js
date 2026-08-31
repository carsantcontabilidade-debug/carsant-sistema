import { createClient } from '@supabase/supabase-js';
import { enviarEmailTransacional } from './_mailer.js';

// Convida um novo colaborador para o sistema interno. Só um gestor
// autenticado pode chamar este endpoint — mesmo padrão de segurança do
// api/portal-invite.js (service role key só aqui no servidor).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ROLES_VALIDAS = ['gestor', 'colaborador'];
const SETORES_VALIDOS = ['fiscal', 'pessoal', 'financeiro', 'contabil'];

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function corpoEmail({ nome, link }) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#1F4788;">CARSANT Contabilidade</h2>
      <p>Olá, ${escapeHtml(nome)}!</p>
      <p>Você foi cadastrado(a) no sistema interno da CARSANT Contabilidade. Clique no botão abaixo para definir sua senha de acesso.</p>
      <p style="text-align:center; margin: 24px 0;">
        <a href="${link}" style="background:#1F4788; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold;">
          Definir minha senha
        </a>
      </p>
      <p style="font-size:12px; color:#777;">Se o botão não funcionar, copie e cole este link no navegador:<br>${link}</p>
      <p style="font-size:12px; color:#777;">CARSANT Contabilidade — Feira de Santana, BA</p>
    </div>
  `;
  return { assunto: 'CARSANT Contabilidade — Acesso ao sistema interno', html };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Variáveis do Supabase não configuradas no servidor (SUPABASE_SERVICE_ROLE_KEY).' });
  }

  const { nome, email, role, setor } = req.body || {};
  if (!nome || !email) {
    return res.status(400).json({ error: 'Campos "nome" e "email" são obrigatórios.' });
  }
  if (role && !ROLES_VALIDAS.includes(role)) {
    return res.status(400).json({ error: 'Role inválida.' });
  }
  if (setor && !SETORES_VALIDOS.includes(setor)) {
    return res.status(400).json({ error: 'Setor inválido.' });
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
  if (perfil?.role !== 'gestor') {
    return res.status(403).json({ error: 'Apenas o gestor pode cadastrar novos usuários.' });
  }

  const { data: usuarios } = await admin.auth.admin.listUsers();
  const jaExiste = usuarios?.users?.some((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (jaExiste) {
    return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
  }

  const redirectTo = `${req.headers.origin || ''}/definir-senha`;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo, data: { nome } },
  });

  if (linkError || !linkData?.properties?.hashed_token) {
    return res.status(502).json({ error: `Falha ao gerar link: ${linkError?.message || 'link não gerado'}` });
  }

  await admin.auth.admin.updateUserById(linkData.user.id, { email_confirm: true });

  // O gatilho handle_new_user() já cria a linha em profiles (com role
  // padrão 'colaborador') — completa com a role/setor escolhidos aqui.
  const { error: updateError } = await admin
    .from('profiles')
    .update({ role: role || 'colaborador', setor: setor || null })
    .eq('id', linkData.user.id);

  if (updateError) {
    return res.status(500).json({ error: `Conta criada, mas falhou ao definir role/setor: ${updateError.message}` });
  }

  const linkParaEmail = `${redirectTo}?token_hash=${linkData.properties.hashed_token}&type=${linkData.properties.verification_type}`;
  const { assunto, html } = corpoEmail({ nome, link: linkParaEmail });

  try {
    await enviarEmailTransacional({ to: email, subject: assunto, html });
  } catch (err) {
    return res.status(502).json({ error: `Conta criada, mas falhou ao enviar o e-mail: ${err.message}` });
  }

  return res.status(200).json({ success: true });
}
