// src/lib/chat.js
// Chat bidirecional Comunicação (equipe) <-> Portal do Cliente

export const SETORES = {
  fiscal: { label: "Fiscal", responsavel: "Bruno" },
  pessoal: { label: "Pessoal / Folha", responsavel: "Karine" },
  financeiro: { label: "Financeiro", responsavel: "Ronaldo" },
  contabil: { label: "Contábil / Societário", responsavel: "Cíntia" },
};

// Cada assunto já define o setor de destino — o cliente escolhe o
// assunto e a mensagem já cai direto para quem deve responder.
export const ASSUNTOS_CHAT = [
  { id: "fiscal", label: "Fiscal (notas fiscais, impostos, obrigações)", setor: "fiscal" },
  { id: "pessoal", label: "Pessoal / Folha de pagamento", setor: "pessoal" },
  { id: "financeiro", label: "Financeiro (honorários, cobranças, boletos)", setor: "financeiro" },
  { id: "contabil", label: "Contábil / Societário", setor: "contabil" },
  { id: "outro", label: "Não sei / Outro assunto", setor: "financeiro" },
];
