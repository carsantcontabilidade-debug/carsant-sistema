import { createClient } from '@supabase/supabase-js';
import { interRequest, autenticar, configurarWebhookCobranca } from './_inter.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido, use POST.' });
    return;
  }

  // Este endpoint mexe direto na conta bancária real da CARSANT no Inter
  // (cria, consulta, cancela e baixa PDF de cobrança) — precisa do mesmo
  // controle de acesso dos demais endpoints sensíveis (gestor autenticado),
  // que faltava aqui antes (corrigido em 2026-07-29 numa revisão de
  // segurança pedida pelo Ronaldo).
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
    return res.status(403).json({ error: 'Apenas o gestor pode gerenciar cobranças no Banco Inter.' });
  }

  const { action, payload } = req.body || {};

  if (!action) {
    res.status(400).json({ error: 'Campo "action" é obrigatório.' });
    return;
  }

  const cert = process.env.INTER_CERT_PEM;
  const key = process.env.INTER_KEY_PEM;
  const clientId = process.env.INTER_CLIENT_ID;
  const clientSecret = process.env.INTER_CLIENT_SECRET;

  if (!cert || !key || !clientId || !clientSecret) {
    res.status(500).json({ error: 'Variáveis de ambiente do Banco Inter não configuradas na Vercel.' });
    return;
  }

  try {
    const { agent, authHeaders } = await autenticar();

    let resultado;

    if (action === 'criar_cobranca') {
      const criacao = await interRequest({
        path: '/cobranca/v3/cobrancas',
        method: 'POST',
        body: payload,
        headers: authHeaders,
        agent,
      });

      // A API v3 do Inter só devolve o codigoSolicitacao na criação.
      // Os dados completos (Pix copia-e-cola, linha digitável, código de
      // barras) só vêm numa consulta subsequente.
      const codigoSolicitacao = criacao.codigoSolicitacao;
      const inter = await interRequest({
        path: `/cobranca/v3/cobrancas/${codigoSolicitacao}`,
        method: 'GET',
        headers: authHeaders,
        agent,
      });

      resultado = {
        codigoSolicitacao,
        nossoNumero: inter.boleto?.nossoNumero,
        codigoBarras: inter.boleto?.codigoBarras,
        linhaDigitavel: inter.boleto?.linhaDigitavel,
        pixCopiaECola: inter.pix?.pixCopiaECola,
      };
    } else if (action === 'consultar_cobranca') {
      const inter = await interRequest({
        path: `/cobranca/v3/cobrancas/${payload.codigoSolicitacao}`,
        method: 'GET',
        headers: authHeaders,
        agent,
      });
      resultado = {
        situacao: inter.cobranca?.situacao || inter.situacao,
        nossoNumero: inter.boleto?.nossoNumero,
        codigoBarras: inter.boleto?.codigoBarras,
        linhaDigitavel: inter.boleto?.linhaDigitavel,
        pixCopiaECola: inter.pix?.pixCopiaECola,
        ...inter,
      };
    } else if (action === 'obter_pdf_cobranca') {
      const inter = await interRequest({
        path: `/cobranca/v3/cobrancas/${payload.codigoSolicitacao}/pdf`,
        method: 'GET',
        headers: authHeaders,
        agent,
      });
      resultado = { pdfBase64: inter.pdf };
    } else if (action === 'cancelar_cobranca') {
      await interRequest({
        path: `/cobranca/v3/cobrancas/${payload.codigoSolicitacao}/cancelar`,
        method: 'POST',
        body: { motivoCancelamento: payload.motivo || 'ACERTOS' },
        headers: authHeaders,
        agent,
      });
      resultado = { sucesso: true };
    } else if (action === 'configurar_webhook') {
      // Registra a URL do webhook de cobranças no Inter — precisa ser
      // chamado uma vez (ou de novo se o domínio mudar). Ver
      // api/inter-webhook.js pra quem recebe os avisos.
      await configurarWebhookCobranca(payload.webhookUrl);
      resultado = { sucesso: true };
    } else {
      res.status(400).json({ error: `Ação desconhecida: ${action}` });
      return;
    }

    res.status(200).json(resultado);
  } catch (err) {
    const mensagem = err?.body?.detail || err?.body?.message || err?.body?.error_description || JSON.stringify(err?.body) || 'Erro desconhecido na integração com o Banco Inter.';
    res.status(200).json({ error: mensagem });
  }
}