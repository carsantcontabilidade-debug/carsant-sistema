import { createClient } from '@supabase/supabase-js';
import { buscarCertidaoMunicipalFeiraDeSantana } from './_certidao-municipal.js';
import { buscarCertidaoEstadualBahia } from './_certidao-estadual.js';

// Emissão automática de certidão (staff-only). "municipal" (Feira de
// Santana) e "estadual" (SEFAZ-BA) estão automatizados — os outros
// tipos continuam manuais porque os portais oficiais usam captcha
// (FGTS, Trabalhista, Federal) ou têm fluxo assíncrono de protocolo
// (Falência/TJBA).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TIPOS_AUTOMATIZADOS = {
  municipal: buscarCertidaoMunicipalFeiraDeSantana,
  estadual: buscarCertidaoEstadualBahia,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Variáveis do Supabase não configuradas no servidor.' });
  }

  const { clienteId, tipo } = req.body || {};
  const buscar = TIPOS_AUTOMATIZADOS[tipo];
  if (!clienteId || !buscar) {
    return res.status(400).json({ error: 'Este tipo de certidão ainda não tem emissão automática.' });
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

  const { data: perfil } = await admin.from('profiles').select('id').eq('id', userData.user.id).maybeSingle();
  if (!perfil) {
    return res.status(403).json({ error: 'Apenas a equipe pode emitir certidões.' });
  }

  const { data: cliente } = await admin.from('clientes').select('id, cnpj').eq('id', clienteId).single();
  if (!cliente?.cnpj) {
    return res.status(400).json({ error: 'Este cliente não tem CNPJ cadastrado.' });
  }

  let resultado;
  try {
    resultado = await buscar(cliente.cnpj);
  } catch (err) {
    return res.status(502).json({ error: `Falha ao consultar o portal oficial: ${err.message}` });
  }

  if (!resultado.sucesso) {
    return res.status(200).json({ sucesso: false, motivo: resultado.motivo });
  }

  const ehPdf = !!resultado.pdfBuffer;
  const extensao = ehPdf ? 'pdf' : 'html';
  const nomeArquivo = `certidao-${tipo}-${resultado.dataEmissao || 'emitida'}.${extensao}`;
  const storagePath = `${clienteId}/${tipo}_auto_${Date.now()}.${extensao}`;
  const conteudo = ehPdf ? resultado.pdfBuffer : Buffer.from(resultado.html, 'utf-8');
  const contentType = ehPdf ? 'application/pdf' : 'text/html; charset=utf-8';

  const { error: uploadError } = await admin.storage
    .from('certidoes')
    .upload(storagePath, conteudo, { contentType });
  if (uploadError) {
    return res.status(500).json({ error: `Certidão obtida, mas falhou ao salvar o arquivo: ${uploadError.message}` });
  }

  const { error: insertError } = await admin.from('certidoes').insert({
    cliente_id: clienteId,
    tipo,
    data_emissao: resultado.dataEmissao,
    data_validade: resultado.dataValidade,
    storage_path: storagePath,
    nome_arquivo: nomeArquivo,
    observacoes: resultado.negativa ? 'Emitida automaticamente (negativa)' : 'Emitida automaticamente — verificar situação (pode não ser negativa)',
    registrado_por: userData.user.id,
  });
  if (insertError) {
    return res.status(500).json({ error: `Certidão salva, mas falhou ao registrar: ${insertError.message}` });
  }

  return res.status(200).json({ sucesso: true, dataValidade: resultado.dataValidade, negativa: resultado.negativa });
}
