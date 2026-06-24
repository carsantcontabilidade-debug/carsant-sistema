// src/lib/comunicacao.js
// Hub de Comunicação — CARSANT Contabilidade

export const CANAIS = {
  whatsapp: { label: "WhatsApp", icone: "📱" },
  email: { label: "E-mail", icone: "✉️" },
  telefone: { label: "Telefone", icone: "📞" },
  presencial: { label: "Presencial", icone: "🤝" },
};

export const TEMPLATES = {
  cobranca_honorarios: {
    label: "💰 Cobrança de honorários em atraso",
    assuntoPadrao: "CARSANT Contabilidade — Honorários em Aberto",
    promptIA: (cliente, canal) => `
Você é um assistente da CARSANT Contabilidade, escritório contábil em Feira de Santana, Bahia.
Gere uma mensagem de cobrança de honorários contábeis em atraso para o cliente abaixo.
A mensagem deve ser cordial, profissional e objetiva, sem ser agressiva.
${canal === "whatsapp" ? "Formate para WhatsApp: use emojis com moderação, parágrafos curtos." : "Formate como e-mail formal."}

Cliente: ${cliente.nome}
Regime: ${cliente.regime_tributario}
Honorário mensal: R$ ${cliente.honorario_mensal?.toFixed(2) || "—"}

Inclua:
- Saudação pelo nome
- Informação sobre o honorário em aberto
- Pedido gentil de regularização
- Disponibilidade para esclarecimentos
- Assinatura da CARSANT Contabilidade

Responda APENAS com o texto da mensagem, sem explicações adicionais.
    `.trim(),
  },

  envio_guia_das: {
    label: "📄 Envio de guia DAS/DCTF/FGTS",
    assuntoPadrao: "CARSANT Contabilidade — Guia para Pagamento",
    promptIA: (cliente, canal) => `
Você é um assistente da CARSANT Contabilidade, escritório contábil em Feira de Santana, Bahia.
Gere uma mensagem para envio de guia tributária para pagamento.
${canal === "whatsapp" ? "Formate para WhatsApp: emojis com moderação, parágrafos curtos." : "Formate como e-mail formal."}

Cliente: ${cliente.nome}
Regime: ${cliente.regime_tributario}

Inclua:
- Saudação pelo nome
- Informação de que a guia está disponível para pagamento
- Lembrete de que o prazo deve ser respeitado
- Instrução para entrar em contato em caso de dúvidas
- Assinatura da CARSANT Contabilidade

Responda APENAS com o texto da mensagem, sem explicações adicionais.
    `.trim(),
  },

  aprovacao_documento: {
    label: "✅ Aprovação de documentos (folha, balanço, declaração)",
    assuntoPadrao: "CARSANT Contabilidade — Documento para Aprovação",
    promptIA: (cliente, canal) => `
Você é um assistente da CARSANT Contabilidade, escritório contábil em Feira de Santana, Bahia.
Gere uma mensagem solicitando aprovação/assinatura de documento contábil.
${canal === "whatsapp" ? "Formate para WhatsApp: emojis com moderação, parágrafos curtos." : "Formate como e-mail formal."}

Cliente: ${cliente.nome}
Regime: ${cliente.regime_tributario}

Inclua:
- Saudação pelo nome
- Informação sobre o documento que precisa de aprovação ou assinatura
- Prazo sugerido para retorno
- Instrução de como proceder (responder confirmando, assinar digitalmente, etc.)
- Assinatura da CARSANT Contabilidade

Responda APENAS com o texto da mensagem, sem explicações adicionais.
    `.trim(),
  },

  aviso_prazo_fiscal: {
    label: "⚠️ Aviso de prazo fiscal próximo",
    assuntoPadrao: "CARSANT Contabilidade — Prazo Fiscal se Aproximando",
    promptIA: (cliente, canal) => `
Você é um assistente da CARSANT Contabilidade, escritório contábil em Feira de Santana, Bahia.
Gere uma mensagem de aviso sobre prazo fiscal próximo, solicitando documentos ou informações necessárias.
${canal === "whatsapp" ? "Formate para WhatsApp: emojis com moderação, parágrafos curtos." : "Formate como e-mail formal."}

Cliente: ${cliente.nome}
Regime: ${cliente.regime_tributario}

Inclua:
- Saudação pelo nome
- Aviso sobre prazo fiscal próximo
- Solicitação de documentos ou informações necessárias
- Urgência da resposta para não perder o prazo
- Assinatura da CARSANT Contabilidade

Responda APENAS com o texto da mensagem, sem explicações adicionais.
    `.trim(),
  },

  boas_vindas: {
    label: "👋 Boas-vindas a novo cliente",
    assuntoPadrao: "Bem-vindo à CARSANT Contabilidade!",
    promptIA: (cliente, canal) => `
Você é um assistente da CARSANT Contabilidade, escritório contábil em Feira de Santana, Bahia.
Gere uma mensagem de boas-vindas calorosa e profissional para um novo cliente.
${canal === "whatsapp" ? "Formate para WhatsApp: emojis com moderação, parágrafos curtos." : "Formate como e-mail formal."}

Cliente: ${cliente.nome}
Regime: ${cliente.regime_tributario}

Inclua:
- Saudação calorosa de boas-vindas
- Breve apresentação da CARSANT
- Informações sobre como o cliente pode entrar em contato
- Próximos passos do onboarding (envio de documentos, etc.)
- Assinatura da CARSANT Contabilidade

Responda APENAS com o texto da mensagem, sem explicações adicionais.
    `.trim(),
  },

  envio_folha_pagamento: {
    label: "📋 Envio de folha de pagamento",
    assuntoPadrao: "CARSANT Contabilidade — Folha de Pagamento",
    promptIA: (cliente, canal) => `
Você é um assistente da CARSANT Contabilidade, escritório contábil em Feira de Santana, Bahia.
Gere uma mensagem para envio da folha de pagamento do mês.
${canal === "whatsapp" ? "Formate para WhatsApp: emojis com moderação, parágrafos curtos." : "Formate como e-mail formal."}

Cliente: ${cliente.nome}
Regime: ${cliente.regime_tributario}

Inclua:
- Saudação pelo nome
- Informação de que a folha de pagamento está disponível
- Orientação para verificar os dados e confirmar aprovação
- Disponibilidade para dúvidas
- Assinatura da CARSANT Contabilidade

Responda APENAS com o texto da mensagem, sem explicações adicionais.
    `.trim(),
  },

  solicitacao_documentos: {
    label: "📂 Solicitação de documentos/notas",
    assuntoPadrao: "CARSANT Contabilidade — Documentos Necessários",
    promptIA: (cliente, canal) => `
Você é um assistente da CARSANT Contabilidade, escritório contábil em Feira de Santana, Bahia.
Gere uma mensagem solicitando documentos, notas fiscais ou extratos para fechamento contábil.
${canal === "whatsapp" ? "Formate para WhatsApp: emojis com moderação, parágrafos curtos." : "Formate como e-mail formal."}

Cliente: ${cliente.nome}
Regime: ${cliente.regime_tributario}

Inclua:
- Saudação pelo nome
- Solicitação de documentos para o fechamento do mês
- Lista genérica de documentos comuns (notas de compra/venda, extratos, etc.)
- Prazo para envio
- Assinatura da CARSANT Contabilidade

Responda APENAS com o texto da mensagem, sem explicações adicionais.
    `.trim(),
  },
};

/**
 * Remove caracteres não numéricos do telefone
 */
export function formatarTelefone(telefone) {
  if (!telefone) return "";
  return telefone.replace(/\D/g, "");
}

/**
 * Gera link wa.me com mensagem pré-preenchida
 */
export function gerarLinkWhatsApp(telefone, mensagem) {
  const num = formatarTelefone(telefone);
  return `https://wa.me/55${num}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * Gera link mailto com assunto e corpo
 */
export function gerarMensagemWhatsApp(cliente, templateKey) {
  const template = TEMPLATES[templateKey];
  if (!template) return "";
  return template.promptIA(cliente, "whatsapp");
}

export function gerarCorpoEmail(cliente, templateKey) {
  const template = TEMPLATES[templateKey];
  if (!template) return "";
  return template.promptIA(cliente, "email");
}
