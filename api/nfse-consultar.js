import { createClient } from '@supabase/supabase-js';
import { consultarNfseServicoPrestado, consultarNfsePorFaixa } from './_webiss-nfse.js';

// Consulta NFS-e já emitidas pela CARSANT no WebISS. Só um gestor
// autenticado pode chamar. Mesmo padrão de auth de api/nfse-emitir.js.

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
    return res.status(403).json({ error: 'Apenas o gestor pode consultar NFS-e.' });
  }

  const { tipo, filtros, ambiente } = req.body || {};
  if (!tipo || !filtros) {
    return res.status(400).json({ error: 'Campos "tipo" e "filtros" são obrigatórios.' });
  }
  const ambienteFinal = ambiente === 'producao' ? 'producao' : 'homologacao';

  try {
    const resultadoXml = tipo === 'porFaixa'
      ? await consultarNfsePorFaixa(filtros, ambienteFinal)
      : await consultarNfseServicoPrestado(filtros, ambienteFinal);
    return res.status(200).json({ success: true, ambiente: ambienteFinal, resultadoXml });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
