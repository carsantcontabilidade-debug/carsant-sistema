import { createClient } from '@supabase/supabase-js';
import { enviarPushParaCliente } from './_push.js';

// Avisa por push um cliente do Portal (ex: novo documento enviado pelo
// escritório). Só um usuário da equipe autenticado pode chamar.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { clienteId, title, body, url } = req.body || {};
  if (!clienteId || !title) {
    return res.status(400).json({ error: 'Campos "clienteId" e "title" são obrigatórios.' });
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
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (!perfil) {
    return res.status(403).json({ error: 'Apenas a equipe pode notificar clientes.' });
  }

  const resultado = await enviarPushParaCliente(clienteId, { title, body, url });
  return res.status(200).json(resultado);
}
