import { createClient } from '@supabase/supabase-js';
import {
  montarDpsAssinada, enviarGerarNfse, parseNfseResposta,
  montarCancelarNfseEnvio, enviarCancelarNfse,
  montarSubstituirNfseEnvio, enviarSubstituirNfse,
} from './_webiss-nfse.js';
import { baixarDanfseOficialPdf, buscarPdfNfseOficialViaRenderizacao } from './_webiss-portal.js';

// Emite/cancela/substitui uma NFS-e via WebISS. Só um gestor autenticado
// pode chamar. Dispatcha por req.body.acao ('emitir' por padrão, 'cancelar'
// ou 'substituir') — tudo num único endpoint pra não esbarrar no teto de
// 12 Serverless Functions do plano Hobby da Vercel.
//
// Emissão tem dois modos de uso:
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
    return res.status(403).json({ error: 'Apenas o gestor pode emitir, cancelar ou substituir NFS-e.' });
  }

  const { acao } = req.body || {};
  if (acao === 'cancelar') return cancelarNota(admin, req, res);
  if (acao === 'substituir') return substituirNota(admin, req, res, userData.user.id);
  if (acao === 'baixarDanfseOficial') return baixarDanfseOficial(admin, req, res);
  return emitirNota(admin, req, res, userData.user.id);
}

async function buscarNotaDeProducao(admin, notaId) {
  const { data: nota, error: notaError } = await admin.from('notas_fiscais').select('numero_nfse, ambiente').eq('id', notaId).single();
  if (notaError || !nota) return { erro: { status: 404, mensagem: 'Nota fiscal não encontrada.' } };
  if (!nota.numero_nfse) return { erro: { status: 400, mensagem: 'Esta nota não tem número da NFS-e registrado.' } };
  if (nota.ambiente !== 'producao') {
    return { erro: { status: 400, mensagem: 'O DANFSE oficial só está disponível para notas de produção.' } };
  }
  return { nota };
}

async function baixarDanfseOficial(admin, req, res) {
  const { notaId } = req.body || {};
  if (!notaId) return res.status(400).json({ error: 'Campo "notaId" é obrigatório.' });

  const { nota, erro } = await buscarNotaDeProducao(admin, notaId);
  if (erro) return res.status(erro.status).json({ error: erro.mensagem });

  try {
    // Renderiza a página de visualização oficial com um Chromium headless
    // de verdade (respeita o CSS de impressão, não corta nada) — ver
    // buscarPdfNfseOficialViaRenderizacao em _webiss-portal.js.
    const { pdfBase64, nomeArquivo } = await buscarPdfNfseOficialViaRenderizacao(nota.numero_nfse);
    return res.status(200).json({ success: true, pdfBase64, nomeArquivo });
  } catch (errRenderizacao) {
    // Se a renderização falhar por algum motivo (ex.: Chromium indisponível
    // no cold start), cai pro "Exportar Lote PDF" antigo — corta informação
    // ao imprimir, mas ainda é o documento oficial, melhor que nada.
    console.warn('Falha ao renderizar DANFSE via Chromium, usando PDF em lote:', errRenderizacao.message);
    try {
      const { pdfBase64, nomeArquivo } = await baixarDanfseOficialPdf(nota.numero_nfse);
      return res.status(200).json({ success: true, pdfBase64, nomeArquivo });
    } catch (errLote) {
      return res.status(502).json({ error: errLote.message });
    }
  }
}

async function resolverTomadorDoCliente(admin, clienteId) {
  const { data: cliente, error } = await admin
    .from('clientes')
    .select('id, nome, cnpj, telefone, email, logradouro, numero_endereco, complemento, bairro, cep, uf, codigo_municipio_ibge')
    .eq('id', clienteId)
    .single();
  if (error || !cliente) return { error: 'Cliente não encontrado.' };
  if (!cliente.cnpj) return { error: 'Este cliente não tem CNPJ cadastrado.' };
  return {
    tomador: {
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
    },
  };
}

async function proximoRpsNumero(admin, ambiente, rpsSerie) {
  const { data: ultimaNota } = await admin
    .from('notas_fiscais')
    .select('rps_numero')
    .eq('ambiente', ambiente)
    .eq('rps_serie', rpsSerie)
    .order('rps_numero', { ascending: false })
    .limit(1)
    .maybeSingle();
  // Começa em 1000 quando não há histórico (não em 1): os primeiros testes
  // de homologação, feitos antes desta tabela existir, já usaram RPS 1 e 2
  // diretamente no WebISS, sem ficar registrados aqui.
  return (ultimaNota?.rps_numero || 999) + 1;
}

async function emitirNota(admin, req, res, userId) {
  const { clienteId, cobrancaId, dados: dadosRecebidos, ambiente } = req.body || {};
  if (!clienteId && !dadosRecebidos) {
    return res.status(400).json({ error: 'Informe "clienteId" ou "dados".' });
  }
  const ambienteFinal = ambiente === 'producao' ? 'producao' : 'homologacao';

  let dados = { ...dadosRecebidos };

  if (clienteId) {
    const resolvido = await resolverTomadorDoCliente(admin, clienteId);
    if (resolvido.error) return res.status(404).json({ error: resolvido.error });
    dados.tomador = resolvido.tomador;
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
    dados.rpsNumero = await proximoRpsNumero(admin, ambienteFinal, dados.rpsSerie);
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
      emitida_por: userId,
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

async function cancelarNota(admin, req, res) {
  const { notaId, codigoCancelamento } = req.body || {};
  if (!notaId) return res.status(400).json({ error: 'Campo "notaId" é obrigatório.' });

  const { data: nota, error: notaError } = await admin.from('notas_fiscais').select('*').eq('id', notaId).single();
  if (notaError || !nota) return res.status(404).json({ error: 'Nota fiscal não encontrada.' });
  if (nota.status === 'cancelada') return res.status(400).json({ error: 'Esta nota já está cancelada.' });
  if (!nota.numero_nfse) return res.status(400).json({ error: 'Esta nota não tem número da NFS-e registrado — não é possível cancelar.' });

  try {
    const envelope = montarCancelarNfseEnvio({ ambiente: nota.ambiente, numero: nota.numero_nfse }, undefined, codigoCancelamento);
    await enviarCancelarNfse(envelope, nota.ambiente);

    const { error: updateError } = await admin.from('notas_fiscais').update({
      status: 'cancelada',
      cancelada_em: new Date().toISOString(),
      motivo_cancelamento: 'Cancelado pelo escritório',
    }).eq('id', notaId);
    if (updateError) {
      return res.status(200).json({ success: true, aviso: `Cancelado na Prefeitura, mas falhou ao atualizar o sistema: ${updateError.message}` });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}

async function substituirNota(admin, req, res, userId) {
  const { notaId, dados: dadosRecebidos, codigoCancelamento } = req.body || {};
  if (!notaId) return res.status(400).json({ error: 'Campo "notaId" é obrigatório.' });

  const { data: notaAntiga, error: notaError } = await admin.from('notas_fiscais').select('*').eq('id', notaId).single();
  if (notaError || !notaAntiga) return res.status(404).json({ error: 'Nota fiscal não encontrada.' });
  if (notaAntiga.status === 'cancelada') return res.status(400).json({ error: 'Esta nota já está cancelada — não é possível substituir.' });
  if (!notaAntiga.numero_nfse) return res.status(400).json({ error: 'Esta nota não tem número da NFS-e registrado — não é possível substituir.' });

  let dados = { ...dadosRecebidos };

  // Diferente da emissão normal, aqui o tomador enviado pelo formulário
  // (permite corrigir nome/CNPJ/endereço errados na nota original) tem
  // prioridade — só busca do cadastro do cliente se nada foi enviado.
  if (!dados.tomador?.cnpj && notaAntiga.cliente_id) {
    const resolvido = await resolverTomadorDoCliente(admin, notaAntiga.cliente_id);
    if (resolvido.error) return res.status(404).json({ error: resolvido.error });
    dados.tomador = resolvido.tomador;
  }
  if (!dados.tomador?.cnpj) {
    return res.status(400).json({ error: 'Tomador sem CNPJ.' });
  }

  dados.valorServicos = dados.valorServicos ?? notaAntiga.valor_servicos;
  dados.discriminacao = dados.discriminacao ?? notaAntiga.discriminacao;
  dados.competencia = dados.competencia || (notaAntiga.competencia ? String(notaAntiga.competencia).slice(0, 10) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
  dados.rpsSerie = dados.rpsSerie || notaAntiga.rps_serie || '1';

  if (!dados.discriminacao || dados.discriminacao.length < 10) {
    return res.status(400).json({ error: 'Discriminação do serviço precisa ter pelo menos 10 caracteres.' });
  }

  if (!dados.rpsNumero) {
    dados.rpsNumero = await proximoRpsNumero(admin, notaAntiga.ambiente, dados.rpsSerie);
  }

  try {
    const envelope = montarSubstituirNfseEnvio(
      { ambiente: notaAntiga.ambiente, numero: notaAntiga.numero_nfse },
      { ...dados, ambiente: notaAntiga.ambiente, dataEmissaoRps: new Date() },
      undefined,
      codigoCancelamento,
    );
    const resultadoXml = await enviarSubstituirNfse(envelope, notaAntiga.ambiente);
    const { numero, codigoVerificacao, chaveAcesso, dataEmissao } = parseNfseResposta(resultadoXml);

    const { error: updateError } = await admin.from('notas_fiscais').update({
      status: 'cancelada',
      cancelada_em: new Date().toISOString(),
      motivo_cancelamento: 'Substituída por nova NFS-e',
    }).eq('id', notaId);
    if (updateError) console.error('Falha ao marcar nota antiga como cancelada:', updateError.message);

    const { error: insertError } = await admin.from('notas_fiscais').insert({
      cliente_id: notaAntiga.cliente_id,
      cobranca_id: notaAntiga.cobranca_id,
      ambiente: notaAntiga.ambiente,
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
      emitida_por: userId,
      substitui_nota_id: notaId,
    });
    if (insertError) console.error('Falha ao gravar a nova nota (substituição):', insertError.message);

    return res.status(200).json({
      success: true,
      ambiente: notaAntiga.ambiente,
      numero,
      codigoVerificacao,
      chaveAcesso,
      resultadoXml,
    });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
