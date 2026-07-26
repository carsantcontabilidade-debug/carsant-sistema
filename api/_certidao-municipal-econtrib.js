// Emissão automática de Certidão Negativa de Débitos Municipais —
// plataforma "e-contrib" (Keep Informática), usada por várias
// prefeituras pequenas (confirmado: Riachão do Jacuípe/BA).
//
// Confirmado sem captcha (testado com CNPJ real via navegador e via
// requisição direta): é uma API REST de verdade por trás de um
// front-end React, não scraping de HTML. Cada prefeitura tem seu
// próprio "slug" identificado pelo header `entidade` (extraído da URL
// do portal — visto no bundle JS: `window.location.pathname.split("/")[2]`).
//
// ATENÇÃO: não foi possível confirmar o formato exato da resposta de
// SUCESSO (só testei CNPJs não cadastrados como contribuinte na
// prefeitura, que retornam objeto de erro). O parser abaixo tenta
// vários nomes de campo plausíveis — se a primeira emissão real
// devolver algo diferente, ajustar aqui com o payload real em mãos.

const BASE = 'https://e-contrib.com.br/gestaotributaria_api/api/portal-contribuinte';

// Município (código IBGE) -> slug da entidade nesta plataforma.
export const MUNICIPIOS_ECONTRIB = {
  '2926301': 'riachaodojacuipe', // Riachão do Jacuípe/BA
};

function parseDataBr(dataBr) {
  const m = dataBr?.match(/(\d{2})\/(\d{2})\/(\d{4})/) || dataBr?.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  if (m[0].includes('/')) { const [, dia, mes, ano] = m; return `${ano}-${mes}-${dia}`; }
  return m[0];
}

export async function buscarCertidaoMunicipalEContrib(cnpj, entidadeSlug) {
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  const resp = await fetch(`${BASE}/contribuintes/emissao-cnd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'entidade': entidadeSlug },
    body: JSON.stringify({ cpf_cnpj: cnpjLimpo }),
  });

  const data = await resp.json().catch(() => ({}));

  if (data.error) {
    const motivo = /n.o encontrado/i.test(data.error)
      ? 'Este cliente não está cadastrado como contribuinte na prefeitura (sem inscrição municipal ativa).'
      : data.error;
    return { sucesso: false, motivo };
  }
  if (!resp.ok) {
    return { sucesso: false, motivo: `Falha ao consultar o portal (HTTP ${resp.status}).` };
  }

  const cnd = data.cnd || data;
  const dataEmissao = parseDataBr(cnd.data_emissao || cnd.dataEmissao || cnd.emissao);
  const dataValidade = parseDataBr(cnd.data_validade || cnd.dataValidade || cnd.validade || cnd.validoAte);
  const arquivoBase64 = cnd.arquivo || cnd.base64 || cnd.pdf || cnd.pdfBase64;

  if (!dataValidade) {
    return { sucesso: false, motivo: 'A prefeitura retornou uma resposta em formato não reconhecido — confira manualmente e avise para ajustar a automação.' };
  }

  return {
    sucesso: true,
    dataEmissao,
    dataValidade,
    pdfBuffer: arquivoBase64 ? Buffer.from(arquivoBase64, 'base64') : undefined,
    html: arquivoBase64 ? undefined : `<pre>${JSON.stringify(cnd, null, 2)}</pre>`,
    negativa: !/positiv/i.test(JSON.stringify(cnd)),
  };
}
