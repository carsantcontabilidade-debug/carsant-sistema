import { createClient } from '@supabase/supabase-js';
import { consultarCobrancaReal } from './_inter.js';

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
// O formato exato do payload que o Inter envia não foi confirmado num
// caso real ainda (documentação não disponibilizou um exemplo) — tenta
// vários nomes de campo plausíveis pro identificador da cobrança; se o
// primeiro aviso real vier diferente, ajustar aqui.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function extrairCodigoSolicitacao(body) {
  return body?.codigoSolicitacao
    || body?.cobranca?.codigoSolicitacao
    || body?.seuNumero
    || body?.cobranca?.seuNumero
    || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  try {
    const body = req.body || {};
    const codigoSolicitacao = extrairCodigoSolicitacao(body);
    if (!codigoSolicitacao) {
      console.warn('Webhook Inter: payload sem identificador reconhecido:', JSON.stringify(body));
      res.status(200).json({ ignorado: true });
      return;
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: cobranca } = await admin
      .from('cobrancas')
      .select('id, status')
      .eq('codigo_solicitacao', codigoSolicitacao)
      .maybeSingle();
    if (!cobranca) {
      res.status(200).json({ ignorado: true });
      return;
    }

    const resultado = await consultarCobrancaReal(codigoSolicitacao);
    const novoStatus = resultado.situacao === 'PAGO' ? 'paga'
      : resultado.situacao === 'CANCELADO' ? 'cancelada'
      : resultado.situacao === 'VENCIDO' ? 'vencida'
      : 'gerada';

    if (novoStatus !== cobranca.status) {
      const payloadAtualizacao = {
        status: novoStatus,
        paga_em: novoStatus === 'paga' ? new Date().toISOString() : null,
      };
      if (novoStatus === 'paga') payloadAtualizacao.forma_pagamento = 'inter';
      await admin.from('cobrancas').update(payloadAtualizacao).eq('id', cobranca.id);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    // Responde 200 mesmo em erro nosso pro Inter não ficar reenviando
    // indefinidamente por causa de uma falha do nosso lado — o erro
    // fica só no log da função (Vercel) pra investigar depois.
    console.error('Erro no webhook do Inter:', err?.message || err);
    res.status(200).json({ erro: true });
  }
}
