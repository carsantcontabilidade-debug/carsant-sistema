import { createClient } from '@supabase/supabase-js';
import { buscarCertidaoMunicipalFeiraDeSantana } from './_certidao-municipal.js';
import { buscarCertidaoMunicipalEContrib, MUNICIPIOS_ECONTRIB } from './_certidao-municipal-econtrib.js';
import { buscarCertidaoEstadualBahia } from './_certidao-estadual.js';

// Emissão automática de certidão (staff-only). Cada município/estado
// pode usar um portal (e código) diferente — por isso o "provedor" é
// escolhido em runtime a partir do código IBGE do município ou da UF
// do cliente, não fixo por tipo. Tipos/lugares sem provedor aqui
// continuam manuais (captcha ou fluxo assíncrono de protocolo).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FEIRA_DE_SANTANA_IBGE = '2910800';

function resolverProvedorMunicipal(codigoMunicipioIbge) {
  if (!codigoMunicipioIbge) return null;
  if (codigoMunicipioIbge === FEIRA_DE_SANTANA_IBGE) return (cnpj) => buscarCertidaoMunicipalFeiraDeSantana(cnpj);
  if (MUNICIPIOS_ECONTRIB[codigoMunicipioIbge]) {
    const slug = MUNICIPIOS_ECONTRIB[codigoMunicipioIbge];
    return (cnpj) => buscarCertidaoMunicipalEContrib(cnpj, slug);
  }
  return null;
}

function resolverProvedorEstadual(uf) {
  if (uf === 'BA') return buscarCertidaoEstadualBahia;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Variáveis do Supabase não configuradas no servidor.' });
  }

  const { tipo } = req.body || {};
  let { clienteId } = req.body || {};
  if (tipo !== 'municipal' && tipo !== 'estadual') {
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

  // Staff pode emitir para qualquer cliente informado. Cliente do
  // Portal (sem linha em profiles) só pode emitir a PRÓPRIA certidão —
  // ignora qualquer clienteId vindo do corpo da requisição e usa o
  // cliente vinculado à própria sessão, pra não dar brecha de emitir
  // certidão de outra empresa.
  const { data: perfil } = await admin.from('profiles').select('id').eq('id', userData.user.id).maybeSingle();
  if (!perfil) {
    const { data: clientePortal } = await admin.from('clientes').select('id').eq('auth_user_id', userData.user.id).maybeSingle();
    if (!clientePortal) {
      return res.status(403).json({ error: 'Não autorizado.' });
    }
    clienteId = clientePortal.id;
  } else if (!clienteId) {
    return res.status(400).json({ error: 'Campo "clienteId" é obrigatório.' });
  }

  const { data: cliente } = await admin.from('clientes').select('id, cnpj, uf, codigo_municipio_ibge').eq('id', clienteId).single();
  if (!cliente?.cnpj) {
    return res.status(400).json({ error: 'Este cliente não tem CNPJ cadastrado.' });
  }

  const buscar = tipo === 'municipal'
    ? resolverProvedorMunicipal(cliente.codigo_municipio_ibge)
    : resolverProvedorEstadual(cliente.uf);

  if (!buscar) {
    return res.status(400).json({
      error: tipo === 'municipal'
        ? 'Não há emissão automática para o município deste cliente ainda.'
        : 'Não há emissão automática para o estado deste cliente ainda.',
    });
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
