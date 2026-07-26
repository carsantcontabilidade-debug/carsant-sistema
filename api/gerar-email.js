import { createClient } from '@supabase/supabase-js';

// Gera rascunhos de e-mail com IA (Google Gemini, plano gratuito) para a
// aba "E-mails com IA" em Atendimento.jsx. A chave da API fica só aqui no
// servidor — nunca é exposta no navegador.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// A disponibilidade de modelos do Gemini pra contas novas muda com
// frequência (2.5-flash-lite e 2.5-flash já foram recusados como "no
// longer available to new users" na mesma tarde). Tenta em ordem até um
// funcionar, só pulando pro próximo quando o erro for especificamente de
// modelo indisponível — não desperdiça tentativa em erro de outro tipo.
const GEMINI_MODELOS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

const PROMPTS = {
  cobranca: (cliente, contexto) => `Escreva um e-mail profissional e cordial de cobrança de honorário contábil para o cliente "${cliente || '[Cliente]'}". ${contexto}. Assine como CARSANT CONTABILIDADE — Feira de Santana, BA.`,
  prazo: (cliente, contexto) => `Escreva um e-mail de aviso de prazo fiscal para "${cliente || '[Cliente]'}". ${contexto}. Seja claro sobre a data e consequências. Assine como CARSANT CONTABILIDADE.`,
  informativo: (cliente, contexto) => `Escreva um informativo/circular sobre: ${contexto}. Para cliente: ${cliente || 'Prezado(a) cliente'}. Assine como CARSANT CONTABILIDADE.`,
  boas_vindas: (cliente, contexto) => `Escreva um e-mail de boas-vindas para o novo cliente "${cliente}". ${contexto}. Assine como CARSANT CONTABILIDADE — Feira de Santana, BA.`,
  documentos: (cliente, contexto) => `Escreva um e-mail solicitando documentos para "${cliente || '[Cliente]'}". ${contexto}. Seja específico e indique o prazo. Assine como CARSANT CONTABILIDADE.`,
  personalizado: (cliente, contexto) => `Escreva um e-mail profissional da CARSANT CONTABILIDADE para "${cliente || '[Cliente]'}". Conteúdo: ${contexto}.`,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor.' });
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

  const { template, cliente, contexto } = req.body || {};
  const montarPrompt = PROMPTS[template];
  if (!montarPrompt) {
    return res.status(400).json({ error: 'Template inválido.' });
  }

  const prompt = montarPrompt(cliente, contexto || '');

  let ultimoErro = 'Nenhum modelo disponível.';
  for (const modelo of GEMINI_MODELOS) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: 'Você é assistente do escritório CARSANT CONTABILIDADE, Feira de Santana-BA. Gere e-mails profissionais, cordiais e objetivos. Retorne apenas o texto do e-mail, sem comentários adicionais.' }],
            },
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      const data = await resp.json();
      if (!resp.ok) {
        ultimoErro = data.error?.message || 'Falha ao gerar e-mail.';
        if (/no longer available/i.test(ultimoErro)) continue; // tenta o próximo da lista
        return res.status(502).json({ error: ultimoErro });
      }
      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!texto) {
        ultimoErro = 'A IA não retornou nenhum texto.';
        continue;
      }
      return res.status(200).json({ texto });
    } catch (err) {
      ultimoErro = `Não foi possível conectar à IA: ${err.message}`;
    }
  }
  return res.status(502).json({ error: ultimoErro });
}
