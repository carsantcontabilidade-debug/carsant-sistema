import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const INTER_BASE_URL = "https://cdpj.partners.bancointer.com.br";
const CLIENT_ID = "d99613c1-3f83-4c10-97af-8ce23732259b";
const CLIENT_SECRET = "35904525-2590-4f3a-a417-6a11705dfede";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getHttpClient() {
  const certChain = Deno.env.get("INTER_CERT_PEM") || "";
  const privateKey = Deno.env.get("INTER_KEY_PEM") || "";
  return (Deno as any).createHttpClient({ certChain, privateKey });
}

async function getInterToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "cobranca.read cobranca.write",
  });

  console.log("Cert PEM presente:", !!Deno.env.get("INTER_CERT_PEM"));
  console.log("Key PEM presente:", !!Deno.env.get("INTER_KEY_PEM"));
  console.log("Cert length:", (Deno.env.get("INTER_CERT_PEM") || "").length);
  console.log("Key length:", (Deno.env.get("INTER_KEY_PEM") || "").length);

  let resp;
  try {
    resp = await fetch(`${INTER_BASE_URL}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      client: getHttpClient(),
    } as any);
  } catch (fetchError) {
    console.log("Fetch lançou exceção:", fetchError.message);
    throw new Error(`Falha na conexão TLS: ${fetchError.message}`);
  }

  console.log("Status da resposta:", resp.status);
  const text = await resp.text();
  console.log("Corpo da resposta:", text);

  if (!resp.ok) throw new Error(`Erro token (${resp.status}): ${text}`);
  const data = JSON.parse(text);
  return data.access_token;
}

async function criarCobranca(token: string, payload: any) {
  const resp = await fetch(`${INTER_BASE_URL}/cobranca/v3/cobrancas`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    client: getHttpClient(),
  } as any);
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function consultarCobranca(token: string, codigoSolicitacao: string) {
  const resp = await fetch(`${INTER_BASE_URL}/cobranca/v3/cobrancas/${codigoSolicitacao}`, {
    headers: { "Authorization": `Bearer ${token}` },
    client: getHttpClient(),
  } as any);
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function listarCobrancas(token: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const resp = await fetch(`${INTER_BASE_URL}/cobranca/v3/cobrancas?${query}`, {
    headers: { "Authorization": `Bearer ${token}` },
    client: getHttpClient(),
  } as any);
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function cancelarCobranca(token: string, codigoSolicitacao: string, motivo: string) {
  const resp = await fetch(`${INTER_BASE_URL}/cobranca/v3/cobrancas/${codigoSolicitacao}/cancelar`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ motivoCancelamento: motivo }),
    client: getHttpClient(),
  } as any);
  if (!resp.ok) throw new Error(await resp.text());
  return { cancelado: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json();
    const token = await getInterToken();
    let result;

    switch (action) {
      case "criar_cobranca":
        result = await criarCobranca(token, payload);
        break;
      case "consultar_cobranca":
        result = await consultarCobranca(token, payload.codigoSolicitacao);
        break;
      case "listar_cobrancas":
        result = await listarCobrancas(token, payload);
        break;
      case "cancelar_cobranca":
        result = await cancelarCobranca(token, payload.codigoSolicitacao, payload.motivo);
        break;
      default:
        throw new Error(`Ação desconhecida: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});