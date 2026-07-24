import { createClient } from '@supabase/supabase-js';
import { montarDpsAssinada, enviarGerarNfse } from './webiss-nfse.js';

// Emite uma NFS-e via WebISS. Só um gestor autenticado pode chamar.
// ambiente vem do corpo da requisição ('homologacao' por padrão) — produção
// só deve ser usada depois de testes extensivos em homologação.

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
  if (perfil?.role !== 'gestor') {
    return res.status(403).json({ error: 'Apenas o gestor pode emitir NFS-e.' });
  }

  const { dados, ambiente } = req.body || {};
  if (!dados) {
    return res.status(400).json({ error: 'Campo "dados" é obrigatório.' });
  }
  const ambienteFinal = ambiente === 'producao' ? 'producao' : 'homologacao';

  try {
    const envelope = montarDpsAssinada({
      ...dados,
      competencia: dados.competencia ? new Date(dados.competencia) : new Date(),
      dataEmissaoRps: new Date(),
    });
    const resultadoXml = await enviarGerarNfse(envelope, ambienteFinal);
    return res.status(200).json({ success: true, ambiente: ambienteFinal, resultadoXml });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
