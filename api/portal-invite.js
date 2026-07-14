import { createClient } from '@supabase/supabase-js';

// Convida um cliente para o Portal do Cliente. Só um gestor autenticado
// pode chamar este endpoint. Usa a service role key (nunca exposta ao
// browser, só em variável de ambiente na Vercel) para criar a conta de
// login do cliente e vincular clientes.auth_user_id.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: 'Variáveis do Supabase não configuradas no servidor (SUPABASE_SERVICE_ROLE_KEY).',
    });
  }

  const { clienteId } = req.body || {};
  if (!clienteId) {
    return res.status(400).json({ error: 'Campo "clienteId" é obrigatório.' });
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

  const { data: perfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (perfil?.role !== 'gestor') {
    return res.status(403).json({ error: 'Apenas o gestor pode convidar clientes para o portal.' });
  }

  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .select('id, nome, email, auth_user_id')
    .eq('id', clienteId)
    .single();

  if (clienteError || !cliente) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  if (!cliente.email) {
    return res.status(400).json({ error: 'Este cliente não tem e-mail cadastrado.' });
  }

  const redirectTo = `${req.headers.origin || ''}/portal/definir-senha`;

  // Já tem conta vinculada (convite anterior) — reenvia um link de definição
  // de senha em vez de tentar criar a conta de novo (o Supabase rejeita
  // convite duplicado para um e-mail que já existe em auth.users).
  if (cliente.auth_user_id) {
    const { error: reenvioError } = await admin.auth.resetPasswordForEmail(cliente.email, { redirectTo });
    if (reenvioError) {
      return res.status(502).json({ error: `Falha ao reenviar link: ${reenvioError.message}` });
    }
    return res.status(200).json({ success: true, reenviado: true });
  }

  const { data: convite, error: conviteError } = await admin.auth.admin.inviteUserByEmail(
    cliente.email,
    { redirectTo, data: { cliente_id: cliente.id, nome: cliente.nome } }
  );

  if (conviteError) {
    return res.status(502).json({ error: `Falha ao enviar convite: ${conviteError.message}` });
  }

  const { error: updateError } = await admin
    .from('clientes')
    .update({ auth_user_id: convite.user.id })
    .eq('id', cliente.id);

  if (updateError) {
    return res.status(500).json({ error: `Convite enviado, mas falhou ao vincular: ${updateError.message}` });
  }

  return res.status(200).json({ success: true });
}
