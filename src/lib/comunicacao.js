// src/lib/comunicacao.js
// Hub de Comunicação — CARSANT Contabilidade

export const CANAIS = {
  whatsapp: { label: "WhatsApp", icone: "📱" },
  email: { label: "E-mail", icone: "✉️" },
  telefone: { label: "Telefone", icone: "📞" },
  presencial: { label: "Presencial", icone: "🤝" },
};

export function formatarTelefone(telefone) {
  if (!telefone) return "";
  return telefone.replace(/\D/g, "");
}

function primeiroNome(nomeCompleto) {
  return nomeCompleto?.split(" ")[0] || "Cliente";
}

function formatarValor(valor) {
  if (!valor) return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const TEMPLATES = {
  cobranca_honorarios: {
    label: "💰 Cobrança de honorários em atraso",
    assuntoPadrao: "CARSANT Contabilidade — Honorários em Aberto",
    gerar: (cliente, canal) => {
      const nome = primeiroNome(cliente.nome);
      const valor = formatarValor(cliente["valor_honorário"] || cliente.honorario_mensal);
      if (canal === "whatsapp") {
        return `Olá, ${nome}! 👋\n\nTudo bem? Passando para lembrá-lo(a) que identificamos um honorário contábil em aberto referente ao mês vigente no valor de *${valor}*.\n\nSabemos que o dia a dia é corrido, por isso gostaríamos de solicitar gentilmente a regularização assim que possível.\n\nQualquer dúvida estamos à disposição! 😊\n\n_CARSANT Contabilidade_\n📍 Feira de Santana, BA`;
      } else {
        return `Prezado(a) ${nome},\n\nEsperamos que esteja bem.\n\nVim ao seu contato para informar que identificamos um honorário contábil em aberto referente ao mês vigente no valor de ${valor}.\n\nPedimos gentilmente que providencie a regularização no prazo mais breve possível. Caso já tenha efetuado o pagamento, por favor desconsidere este comunicado.\n\nEstamos à disposição para qualquer esclarecimento.\n\nAtenciosamente,\nEquipe CARSANT Contabilidade\nFeira de Santana, BA\n(75) XXXX-XXXX`;
      }
    },
  },

  envio_guia_das: {
    label: "📄 Envio de guia DAS/DCTF/FGTS",
    assuntoPadrao: "CARSANT Contabilidade — Guia para Pagamento",
    gerar: (cliente, canal) => {
      const nome = primeiroNome(cliente.nome);
      if (canal === "whatsapp") {
        return `Olá, ${nome}! 👋\n\nSua guia de pagamento já está disponível! 📄\n\nPor favor, efetue o pagamento até a data de vencimento para evitar multas e juros.\n\nEm caso de dúvidas, estamos à disposição! 😊\n\n_CARSANT Contabilidade_`;
      } else {
        return `Prezado(a) ${nome},\n\nSegue em anexo a guia para pagamento referente ao período vigente.\n\nSolicitamos que o pagamento seja efetuado até a data de vencimento indicada na guia, a fim de evitar incidência de multas e juros.\n\nQualquer dúvida, não hesite em nos contatar.\n\nAtenciosamente,\nEquipe CARSANT Contabilidade\nFeira de Santana, BA`;
      }
    },
  },

  aprovacao_documento: {
    label: "✅ Aprovação de documentos (folha, balanço, declaração)",
    assuntoPadrao: "CARSANT Contabilidade — Documento para Aprovação",
    gerar: (cliente, canal) => {
      const nome = primeiroNome(cliente.nome);
      if (canal === "whatsapp") {
        return `Olá, ${nome}! 👋\n\nTemos um documento pronto para sua aprovação. ✅\n\nPor favor, verifique e nos confirme sua aprovação respondendo esta mensagem.\n\nAguardamos seu retorno até *48 horas* para prosseguirmos. ⏰\n\n_CARSANT Contabilidade_`;
      } else {
        return `Prezado(a) ${nome},\n\nSegue em anexo documento para sua análise e aprovação.\n\nPedimos que verifique as informações e nos confirme sua aprovação respondendo este e-mail em até 48 horas para que possamos dar continuidade ao processo.\n\nCaso haja qualquer divergência ou dúvida, estamos à disposição.\n\nAtenciosamente,\nEquipe CARSANT Contabilidade\nFeira de Santana, BA`;
      }
    },
  },

  aviso_prazo_fiscal: {
    label: "⚠️ Aviso de prazo fiscal próximo",
    assuntoPadrao: "CARSANT Contabilidade — Prazo Fiscal se Aproximando",
    gerar: (cliente, canal) => {
      const nome = primeiroNome(cliente.nome);
      const regime = cliente.regime || cliente.regime_tributario || "";
      if (canal === "whatsapp") {
        return `Olá, ${nome}! ⚠️\n\nPassando para avisar que temos um prazo fiscal se aproximando para sua empresa.\n\nPara que possamos cumprir o prazo sem intercorrências, precisamos que você nos envie os documentos e informações necessárias o mais breve possível.\n\nConta com a gente! 💪\n\n_CARSANT Contabilidade_`;
      } else {
        return `Prezado(a) ${nome},\n\nInformamos que há um prazo fiscal próximo referente às obrigações da sua empresa${regime ? ` (${regime})` : ""}.\n\nPara que possamos atendê-lo(a) dentro do prazo legal, solicitamos que nos encaminhe os documentos e informações necessárias com a maior brevidade possível.\n\nContamos com sua colaboração.\n\nAtenciosamente,\nEquipe CARSANT Contabilidade\nFeira de Santana, BA`;
      }
    },
  },

  boas_vindas: {
    label: "👋 Boas-vindas a novo cliente",
    assuntoPadrao: "Bem-vindo(a) à CARSANT Contabilidade!",
    gerar: (cliente, canal) => {
      const nome = primeiroNome(cliente.nome);
      if (canal === "whatsapp") {
        return `Olá, ${nome}! Seja muito bem-vindo(a) à *CARSANT Contabilidade*! 🎉\n\nEstamos muito felizes em tê-lo(a) como cliente.\n\nA partir de agora, nossa equipe estará à disposição para cuidar de toda a parte contábil da sua empresa com dedicação e profissionalismo.\n\nEm breve entraremos em contato para alinhar os próximos passos. Qualquer dúvida, é só chamar! 😊\n\n_CARSANT Contabilidade_\n📍 Feira de Santana, BA`;
      } else {
        return `Prezado(a) ${nome},\n\nÉ com grande satisfação que damos as boas-vindas à CARSANT Contabilidade!\n\nSomos um escritório contábil localizado em Feira de Santana, BA, comprometido em oferecer serviços de alta qualidade com atendimento personalizado.\n\nNossos próximos passos serão:\n1. Coleta dos documentos iniciais da empresa\n2. Análise da situação fiscal atual\n3. Alinhamento do calendário de obrigações\n\nEstamos à disposição para qualquer dúvida.\n\nSeja bem-vindo(a)!\n\nAtenciosamente,\nEquipe CARSANT Contabilidade\nFeira de Santana, BA`;
      }
    },
  },

  envio_folha_pagamento: {
    label: "📋 Envio de folha de pagamento",
    assuntoPadrao: "CARSANT Contabilidade — Folha de Pagamento",
    gerar: (cliente, canal) => {
      const nome = primeiroNome(cliente.nome);
      if (canal === "whatsapp") {
        return `Olá, ${nome}! 👋\n\nA folha de pagamento do mês já está pronta! 📋\n\nPor favor, verifique os dados e nos confirme a aprovação para que possamos processar os pagamentos.\n\nQualquer ajuste necessário, é só avisar! 😊\n\n_CARSANT Contabilidade_`;
      } else {
        return `Prezado(a) ${nome},\n\nEncaminhamos em anexo a folha de pagamento referente ao mês vigente para sua análise e aprovação.\n\nSolicitamos que verifique os dados dos colaboradores, valores e descontos. Caso esteja de acordo, pedimos a confirmação por e-mail para que possamos liberar os pagamentos.\n\nQualquer correção necessária, por favor nos informe.\n\nAtenciosamente,\nEquipe CARSANT Contabilidade\nFeira de Santana, BA`;
      }
    },
  },

  solicitacao_documentos: {
    label: "📂 Solicitação de documentos/notas",
    assuntoPadrao: "CARSANT Contabilidade — Documentos Necessários",
    gerar: (cliente, canal) => {
      const nome = primeiroNome(cliente.nome);
      if (canal === "whatsapp") {
        return `Olá, ${nome}! 👋\n\nEstamos no período de fechamento contábil e precisamos dos documentos do mês para dar continuidade aos trabalhos. 📂\n\nPor favor, nos envie:\n• Notas fiscais de compra e venda\n• Extratos bancários\n• Comprovantes de despesas\n• Demais documentos do período\n\nAguardamos até o final desta semana. Obrigado! 🙏\n\n_CARSANT Contabilidade_`;
      } else {
        return `Prezado(a) ${nome},\n\nEstamos realizando o fechamento contábil do mês e precisamos dos documentos referentes ao período.\n\nSolicitamos o envio de:\n- Notas fiscais de entrada e saída\n- Extratos bancários de todas as contas\n- Comprovantes de despesas operacionais\n- Relatório de vendas (se aplicável)\n- Demais documentos do período\n\nPedimos que nos encaminhe os documentos até o final desta semana para que possamos cumprir os prazos legais.\n\nAtenciosamente,\nEquipe CARSANT Contabilidade\nFeira de Santana, BA`;
      }
    },
  },
};
