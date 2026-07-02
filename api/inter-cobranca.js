import https from 'https';

const INTER_BASE_URL = 'cdpj.partners.bancointer.com.br';

function buildAgent() {
  return new https.Agent({
    cert: process.env.INTER_CERT_PEM,
    key: process.env.INTER_KEY_PEM,
  });
}

function interRequest({ path, method = 'GET', body, headers = {}, agent }) {
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

async function obterToken(agent) {
  const params = new URLSearchParams({
    client_id: process.env.INTER_CLIENT_ID,
    client_secret: process.env.INTER_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'cobranca-cobv3.write cobranca-cobv3.read',
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido, use POST.' });
    return;
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

  const agent = buildAgent();

  try {
    const token = await obterToken(agent);
    const authHeaders = { Authorization: `Bearer ${token}` };

    let resultado;

    if (action === 'criar_cobranca') {
      const inter = await interRequest({
        path: '/cobranca/v3/cobrancas',
        method: 'POST',
        body: payload,
        headers: authHeaders,
        agent,
      });
      resultado = {
        codigoSolicitacao: inter.codigoSolicitacao,
        nossoNumero: inter.cobranca?.nossoNumero || inter.nossoNumero,
        codigoBarras: inter.boleto?.codigoBarras || inter.codigoBarras,
        linhaDigitavel: inter.boleto?.linhaDigitavel || inter.linhaDigitavel,
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
        ...inter,
      };
    } else if (action === 'cancelar_cobranca') {
      await interRequest({
        path: `/cobranca/v3/cobrancas/${payload.codigoSolicitacao}/cancelar`,
        method: 'POST',
        body: { motivoCancelamento: payload.motivo || 'ACERTOS' },
        headers: authHeaders,
        agent,
      });
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