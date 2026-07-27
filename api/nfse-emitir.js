import { createClient } from '@supabase/supabase-js';
import { montarDpsAssinada, enviarGerarNfse, parseNfseResposta } from './webiss-nfse.js';

// Emite uma NFS-e via WebISS. Só um gestor autenticado pode chamar.
// ambiente vem do corpo da requisição ('homologacao' por padrão) — produção
// só deve ser usada depois de testes extensivos em homologação.
//
// Dois modos de uso:
// - { clienteId, dados: { valorServicos?, discriminacao?, competencia? } } —
//   busca nome/CNPJ/endereço/contato do cadastro real do cliente.
// - { dados: { ...tudo manual, tomador: {...} } } — usado pela tela de teste
//   em homologação, sem vínculo com um cliente cadastrado.

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

  const { clienteId, cobrancaId, dados: dadosRecebidos, ambiente } = req.body || {};
  if (!clienteId && !dadosRecebidos) {
    return res.status(400).json({ error: 'Informe "clienteId" ou "dados".' });
  }
  const ambienteFinal = ambiente === 'producao' ? 'producao' : 'homologacao';

  let dados = { ...dadosRecebidos };

  if (clienteId) {
    const { data: cliente, error: clienteError } = await admin
      .from('clientes')
      .select('id, nome, cnpj, telefone, email, logradouro, numero_endereco, complemento, bairro, cep, uf, codigo_municipio_ibge')
      .eq('id', clienteId)
      .single();
    if (clienteError || !cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (!cliente.cnpj) {
      return res.status(400).json({ error: 'Este cliente não tem CNPJ cadastrado.' });
    }
    dados.tomador = {
      razaoSocial: cliente.nome,
      cnpj: cliente.cnpj.replace(/\D/g, ''),
      email: cliente.email || undefined,
      telefone: cliente.telefone ? cliente.telefone.replace(/\D/g, '') : undefined,
      endereco: cliente.logradouro ? {
        logradouro: cliente.logradouro,
        numero: cliente.numero_endereco,
        complemento: cliente.complemento,
        bairro: cliente.bairro,
        cep: cliente.cep ? cliente.cep.replace(/\D/g, '') : undefined,
        uf: cliente.uf,
        codigoMunicipioIbge: cliente.codigo_municipio_ibge,
      } : undefined,
    };
  }

  if (!dados.tomador?.cnpj) {
    return res.status(400).json({ error: 'Tomador sem CNPJ.' });
  }
  if (!dados.valorServicos) {
    return res.status(400).json({ error: 'Campo "valorServicos" é obrigatório.' });
  }
  if (!dados.discriminacao || dados.discriminacao.length < 10) {
    return res.status(400).json({ error: 'Discriminação do serviço precisa ter pelo menos 10 caracteres.' });
  }

  dados.rpsSerie = dados.rpsSerie || '1';
  dados.competencia = dados.competencia || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

  if (!dados.rpsNumero) {
    const { data: ultimaNota } = await admin
      .from('notas_fiscais')
      .select('rps_numero')
      .eq('ambiente', ambienteFinal)
      .eq('rps_serie', dados.rpsSerie)
      .order('rps_numero', { ascending: false })
      .limit(1)
      .maybeSingle();
    // Começa em 1000 quando não há histórico (não em 1): os primeiros testes
    // de homologação, feitos antes desta tabela existir, já usaram RPS 1 e 2
    // diretamente no WebISS, sem ficar registrados aqui.
    dados.rpsNumero = (ultimaNota?.rps_numero || 999) + 1;
  }

  try {
    const envelope = montarDpsAssinada({
      ...dados,
      ambiente: ambienteFinal,
      dataEmissaoRps: new Date(),
    });
    const resultadoXml = await enviarGerarNfse(envelope, ambienteFinal);
    const { numero, codigoVerificacao, chaveAcesso, dataEmissao } = parseNfseResposta(resultadoXml);

    const { error: insertError } = await admin.from('notas_fiscais').insert({
      cliente_id: clienteId || null,
      cobranca_id: cobrancaId || null,
      ambiente: ambienteFinal,
      rps_numero: dados.rpsNumero,
      rps_serie: dados.rpsSerie,
      numero_nfse: numero,
      codigo_verificacao: codigoVerificacao,
      chave_acesso: chaveAcesso,
      competencia: dados.competencia,
      data_emissao: dataEmissao || null,
      valor_servicos: dados.valorServicos,
      discriminacao: dados.discriminacao,
      status: 'emitida',
      xml_resposta: resultadoXml,
      emitida_por: userData.user.id,
    });
    if (insertError) {
      // A nota já foi emitida de verdade no WebISS — não falhar a resposta
      // por causa de um erro ao só *registrar* isso aqui, mas avisar.
      console.error('Falha ao gravar notas_fiscais:', insertError.message);
    }

    return res.status(200).json({
      success: true,
      ambiente: ambienteFinal,
      numero,
      codigoVerificacao,
      chaveAcesso,
      resultadoXml,
    });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
