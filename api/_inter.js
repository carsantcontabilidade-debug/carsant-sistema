// Funções compartilhadas de baixo nível para falar com a API do Banco
// Inter (Cobrança v3) — usadas por api/inter-cobranca.js (ações do
// gestor autenticado) e por api/inter-webhook.js (recebe avisos do
// próprio Inter). Extraído aqui pra não duplicar a autenticação/cert em
// dois arquivos.

import https from 'https';

const INTER_BASE_URL = 'cdpj.partners.bancointer.com.br';

export function buildAgent() {
  return new https.Agent({
    cert: process.env.INTER_CERT_PEM,
    key: process.env.INTER_KEY_PEM,
  });
}

export function interRequest({ path, method = 'GET', body, headers = {}, agent }) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: INTER_BASE_URL,
      path,
      method,
      agent,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (e) {
          parsed = { rawResponse: raw };
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          reject({ status: res.statusCode, body: parsed });
        }
      });
    });

    req.on('error', (err) => reject({ status: 0, body: { message: err.message } }));
    if (data) req.write(data);
    req.end();
  });
}

export async function obterToken(agent) {
  const params = new URLSearchParams({
    client_id: process.env.INTER_CLIENT_ID,
    client_secret: process.env.INTER_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'boleto-cobranca.write boleto-cobranca.read',
  });

  return new Promise((resolve, reject) => {
    const body = params.toString();
    const options = {
      hostname: INTER_BASE_URL,
      path: '/oauth/v2/token',
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = { rawResponse: raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300 && parsed.access_token) {
          resolve(parsed.access_token);
        } else {
          reject({ status: res.statusCode, body: parsed });
        }
      });
    });
    req.on('error', (err) => reject({ status: 0, body: { message: err.message } }));
    req.write(body);
    req.end();
  });
}

// Autentica e devolve { agent, authHeaders } prontos pra usar em
// chamadas subsequentes com interRequest().
export async function autenticar() {
  const agent = buildAgent();
  const token = await obterToken(agent);
  return { agent, authHeaders: { Authorization: `Bearer ${token}` } };
}

// Consulta o status REAL de uma cobrança direto no Inter — usado tanto
// pela ação "consultar_cobranca" (chamada manual do gestor) quanto pelo
// webhook (que nunca confia no que a chamada recebida diz, só usa ela
// como aviso pra reconsultar aqui).
export async function consultarCobrancaReal(codigoSolicitacao) {
  const { agent, authHeaders } = await autenticar();
  const inter = await interRequest({
    path: `/cobranca/v3/cobrancas/${codigoSolicitacao}`,
    method: 'GET',
    headers: authHeaders,
    agent,
  });
  return {
    situacao: inter.cobranca?.situacao || inter.situacao,
    nossoNumero: inter.boleto?.nossoNumero,
    codigoBarras: inter.boleto?.codigoBarras,
    linhaDigitavel: inter.boleto?.linhaDigitavel,
    pixCopiaECola: inter.pix?.pixCopiaECola,
    ...inter,
  };
}

// Registra a URL do webhook no Inter — PUT idempotente, pode chamar de
// novo se a URL mudar (troca de domínio, por exemplo). Confirmado via
// documentação oficial (developers.inter.co/docs/webhooks) e via
// biblioteca de referência (endpoint cobranca/v3/cobrancas/webhook).
export async function configurarWebhookCobranca(webhookUrl) {
  const { agent, authHeaders } = await autenticar();
  return interRequest({
    path: '/cobranca/v3/cobrancas/webhook',
    method: 'PUT',
    body: { webhookUrl },
    headers: authHeaders,
    agent,
  });
}
