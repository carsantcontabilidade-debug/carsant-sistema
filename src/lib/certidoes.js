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

// Portais que não têm emissão automática (captcha ou protocolo
// assíncrono) — link direto só para agilizar o preenchimento manual,
// sem fingir que é automático.
export const PORTAL_OFICIAL = {
  federal: 'https://servicos.receitafederal.gov.br/servico/certidoes/',
  trabalhista: 'https://cndt-certidao.tst.jus.br/',
  fgts: 'https://consulta-crf.caixa.gov.br/',
  falencia: 'https://esaj.tjba.jus.br/esaj/portal.do?servico=810000',
};

// Municípios/estados com emissão automática de verdade hoje — mantido
// em sincronia manual com a lógica de api/certidao-emitir.js (se um
// provedor novo entrar lá, adicionar aqui também).
export const MUNICIPIOS_AUTOMATIZADOS = ['2910800', '2926301']; // Feira de Santana, Riachão do Jacuípe
export const ESTADOS_AUTOMATIZADOS = ['BA'];

// Para os municípios/estados SEM automação, pelo menos um link direto
// pro portal certo (levantados na pesquisa de expansão) — evita ter
// que sair procurando toda vez. Nem todo lugar tem um portal online
// conhecido (prefeituras pequenas às vezes só atendem presencial).
export const PORTAL_OFICIAL_ESTADUAL = {
  MG: 'https://www.mg.gov.br/servico/emitir-certidao-de-debitos-tributarios-cdt',
  MT: 'https://www.sefaz.mt.gov.br/cnd/certidao/servlet/ServletRotdAberto?origem=57',
  PR: 'https://refis.fazenda.pr.gov.br/servicos/Empresa/Certidoes/Emitir-Certidao-Negativa-Receita-Estadual-kZrX5gol',
  MA: 'https://sistemas1.sefaz.ma.gov.br/certidoes/jsp/emissaoCertidaoNegativa/emissaoCertidaoNegativa.jsf',
};

export const PORTAL_OFICIAL_MUNICIPAL = {
  '2927408': 'https://servicosweb.sefaz.salvador.ba.gov.br/sistema/certidao_negativa/servicos_certidao_negativa.asp', // Salvador
  '2914505': 'https://www.municipioonline.com.br/ba/prefeitura/irara/contribuinte/certidao', // Irará
  '2931905': 'https://www.municipioonline.com.br/ba/prefeitura/tucano/contribuinte/certidao', // Tucano
  '2932804': 'https://www.municipioonline.com.br/ba/prefeitura/utinga/contribuinte/certidao', // Utinga
  '2906857': 'https://www.municipioonline.com.br/ba/prefeitura/capeladoaltoalegre/contribuinte/certidao', // Capela do Alto Alegre
  '2900405': 'https://www.municipioonline.com.br/ba/prefeitura/aguafria/contribuinte/certidao', // Água Fria
  '2911600': 'https://www.municipioonline.com.br/ba/prefeitura/governadormangabeira/contribuinte/certidao', // Governador Mangabeira
  '2928802': 'https://www.municipioonline.com.br/ba/prefeitura/santoestevao/contribuinte/certidao', // Santo Estêvão
  '2930105': 'https://www.municipioonline.com.br/ba/prefeitura/senhordobonfim/contribuinte/certidao', // Senhor do Bonfim
  '2911402': 'https://gloria.ba.gov.br/', // Glória (só site institucional/contato)
  '2922730': 'https://www.novafatima.ba.gov.br/', // Nova Fátima (só site institucional)
  '2907301': 'https://castroalves.ba.gov.br/', // Castro Alves (só site institucional)
  '2908408': 'https://conceicaodocoite.ba.gov.br/servicos-ao-cidadao/', // Conceição do Coité
  '2928000': 'https://santaluz.ba.gov.br/', // Santaluz (só site institucional)
  '2928703': 'https://saj.ba.gov.br/', // Santo Antônio de Jesus (só site institucional)
  '2919553': 'https://conecta.luiseduardomagalhaes.ba.gov.br/site/servicos/635', // Luís Eduardo Magalhães (parece exigir login)
  '2933158': 'https://www.varzeanova.ba.gov.br/', // Várzea Nova (só site institucional)
  '2924058': 'https://www.pedeserra.ba.gov.br/', // Pé de Serra (só site institucional)
  '2919207': 'https://laurodefreitas.ba.io.org.br/servicos/Cidadao/44933/Emissao-de-Certidao-negativa-de-Debito', // Lauro de Freitas
};

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

// Checa se município/estado do cliente tem provedor automático de
// verdade — mesma checagem usada no painel interno e no Portal, pra
// não mostrar o botão de raio onde ele nunca vai funcionar.
export function temAutomacao(cliente, tipo) {
  if (tipo === 'municipal') return MUNICIPIOS_AUTOMATIZADOS.includes(cliente.codigo_municipio_ibge)
  if (tipo === 'estadual') return ESTADOS_AUTOMATIZADOS.includes(cliente.uf)
  return false
}

// Link de apoio (abrir portal oficial) pro cliente+tipo, quando não
// existe automação.
export function portalDeApoio(cliente, tipo) {
  if (PORTAL_OFICIAL[tipo]) return PORTAL_OFICIAL[tipo]
  if (tipo === 'municipal') return PORTAL_OFICIAL_MUNICIPAL[cliente.codigo_municipio_ibge]
  if (tipo === 'estadual') return PORTAL_OFICIAL_ESTADUAL[cliente.uf]
  return null
}

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
