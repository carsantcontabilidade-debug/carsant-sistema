import { createClient } from '@supabase/supabase-js';
import { consultarCobrancaReal, mapearSituacaoInter } from './_inter.js';

// Recebe os avisos (callbacks) que o Inter manda quando o status de uma
// cobrança muda (ex.: cliente pagou o boleto/Pix).
//
// IMPORTANTE — segurança: o Inter recomenda validar essas chamadas por
// certificado mútuo (mTLS) — o Inter se conecta usando o certificado
// dele, e o servidor deveria conferir isso antes de aceitar (confirmado
// em developers.inter.co/docs/webhooks/callback-webhook). Isso NÃO é
// possível na Vercel: funções serverless não expõem o handshake TLS
// bruto pro código, então não tem como checar o certificado do lado de
// cá — é uma limitação da hospedagem, não algo que dá pra contornar no
// código.
//
// Por isso este endpoint NUNCA confia no conteúdo do aviso em si — só
// usa ele como gatilho pra reconsultar o status real direto no Inter
// (pelo mesmo canal autenticado com certificado que já usamos pra tudo
// mais), e só atualiza o banco com base nessa resposta confirmada. Se
// alguém descobrir esta URL e mandar avisos falsos, o pior que acontece
// é uma consulta extra sem efeito nenhum — nunca escreve nada sem
// confirmar direto com o Inter primeiro.
//
// Formato do payload confirmado na referência oficial
// (developers.inter.co/references/cobranca-bolepix#tag/Webhook, seção
// "Callback payload samples"): o Inter manda uma LISTA de objetos, não
// um objeto único — ex.: [{ codigoSolicitacao, seuNumero, situacao, ... }].
// Um único POST pode trazer avisos de mais de uma cobrança de uma vez.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Rede de segurança: o webhook do Inter pode se perder (aviso não entregue,
// falha nossa) e a cobrança paga ficava "gerada/vencida" para sempre. Esta
// conferência reconsulta no Inter as cobranças em aberto e corrige o status.
// Roda 1x por dia (cron da Vercel); o botão "Sincronizar com o Inter" da tela
// de Cobranças faz o mesmo sob demanda.
async function sincronizarAbertas(admin, orcamentoMs = 50000) {
  const inicio = Date.now();
  const { data: abertas } = await admin
    .from('cobrancas')
    .select('id, status, codigo_solicitacao')
    .in('status', ['gerada', 'vencida'])
    .not('codigo_solicitacao', 'is', null)
    .order('vencimento', { ascending: true });
  let verificadas = 0;
  let atualizadas = 0;
  for (const cob of abertas || []) {
    if (Date.now() - inicio > orcamentoMs) break;
    try {
      const resultado = await consultarCobrancaReal(cob.codigo_solicitacao);
      const novoStatus = mapearSituacaoInter(resultado.situacao);
      verificadas++;
      if (novoStatus === cob.status) continue;
      const payload = { status: novoStatus, paga_em: novoStatus === 'paga' ? new Date().toISOString() : null };
      if (novoStatus === 'paga') payload.forma_pagamento = 'inter';
      await admin.from('cobrancas').update(payload).eq('id', cob.id);
      atualizadas++;
    } catch (err) {
      console.warn('Sincronização: falha ao consultar', cob.codigo_solicitacao, err?.message || err);
    }
  }
  return { total: (abertas || []).length, verificadas, atualizadas };
}

async function processarAviso(admin, aviso) {
  const codigoSolicitacao = aviso?.codigoSolicitacao;
  if (!codigoSolicitacao) return;

  const { data: cobranca } = await admin
    .from('cobrancas')
    .select('id, status')
    .eq('codigo_solicitacao', codigoSolicitacao)
    .maybeSingle();
  if (!cobranca) return;

  const resultado = await consultarCobrancaReal(codigoSolicitacao);
  const novoStatus = mapearSituacaoInter(resultado.situacao);
  if (novoStatus === cobranca.status) return;

  const payloadAtualizacao = {
    status: novoStatus,
    paga_em: novoStatus === 'paga' ? new Date().toISOString() : null,
  };
  if (novoStatus === 'paga') payloadAtualizacao.forma_pagamento = 'inter';
  await admin.from('cobrancas').update(payloadAtualizacao).eq('id', cobranca.id);
}

export default async function handler(req, res) {
  // Cron diário da Vercel (mesmo critério de api/backup.js).
  if (req.method === 'GET') {
    const doCron = !!req.headers['x-vercel-cron'] || (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`);
    if (!doCron) return res.status(401).json({ error: 'Não autorizado.' });
    try {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      return res.status(200).json({ ok: true, ...(await sincronizarAbertas(admin)) });
    } catch (err) {
      console.error('Erro na sincronização diária do Inter:', err?.message || err);
      return res.status(500).json({ error: 'Falha na sincronização.' });
    }
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  try {
    const body = req.body;
    // Aceita tanto a lista (formato confirmado) quanto um objeto único,
    // por segurança — caso algum produto novo do Inter ainda mande no
    // formato antigo.
    const avisos = Array.isArray(body) ? body : (body ? [body] : []);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    for (const aviso of avisos) {
      await processarAviso(admin, aviso);
    }

    res.status(200).json({ ok: true, processados: avisos.length });
  } catch (err) {
    // Responde 200 mesmo em erro nosso pro Inter não ficar reenviando
    // indefinidamente por causa de uma falha do nosso lado — o erro
    // fica só no log da função (Vercel) pra investigar depois.
    console.error('Erro no webhook do Inter:', err?.message || err);
    res.status(200).json({ erro: true });
  }
}
