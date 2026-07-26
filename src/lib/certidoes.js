// src/lib/certidoes.js
// Painel de lembrete de certidões negativas — não é renovação
// automática (bloqueada por CAPTCHA na maioria dos portais e falta de
// API unificada entre municípios), só rastreio de validade.

export const TIPOS_CERTIDAO = [
  { id: 'municipal', label: 'Municipal' },
  { id: 'estadual', label: 'Estadual' },
  { id: 'federal', label: 'Federal' },
  { id: 'trabalhista', label: 'Trabalhista (CNDT)' },
  { id: 'fgts', label: 'FGTS' },
  { id: 'falencia', label: 'Falência/Concordata' },
];

const DIAS_AVISO_VENCIMENTO = 15;

export function statusCertidao(dataValidade) {
  if (!dataValidade) return 'sem_registro';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(`${dataValidade}T00:00:00`);
  const limiteAviso = new Date(hoje);
  limiteAviso.setDate(limiteAviso.getDate() + DIAS_AVISO_VENCIMENTO);

  if (validade < hoje) return 'vencida';
  if (validade <= limiteAviso) return 'vencendo';
  return 'valida';
}

export const STATUS_LABEL = {
  valida: 'Válida',
  vencendo: 'Vencendo',
  vencida: 'Vencida',
  sem_registro: 'Não cadastrada',
};

export const STATUS_COR = {
  valida: 'bg-green-100 text-green-700 border-green-200',
  vencendo: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  vencida: 'bg-red-100 text-red-700 border-red-200',
  sem_registro: 'bg-gray-50 text-gray-400 border-gray-200',
};

// Dado o array de certidões de um cliente (todas, histórico incluso),
// retorna a mais recente de cada tipo (a que "vale" hoje).
export function certidoesAtuais(certidoes) {
  const atuais = {};
  for (const c of certidoes) {
    const atual = atuais[c.tipo];
    if (!atual) { atuais[c.tipo] = c; continue; }
    const dataC = c.data_validade || c.created_at;
    const dataAtual = atual.data_validade || atual.created_at;
    if (dataC > dataAtual) atuais[c.tipo] = c;
  }
  return atuais;
}
