// Emissão automática da Certidão Negativa de Tributos Municipais —
// Prefeitura de Feira de Santana (SEFAZ Municipal).
//
// Confirmado por teste real (CNPJ público, 25/07/2026): o portal não usa
// captcha nem exige login — é um POST simples com o CNPJ que devolve os
// dados do contribuinte e, se o cadastro estiver completo, um link pra
// página de impressão da certidão em si. Diferente de FGTS/Trabalhista/
// Federal (que usam captcha) e por isso não são automatizados.

const BASE_URL = 'https://www.sefaz.feiradesantana.ba.gov.br';

// O servidor declara charset=utf-8 no header/meta, mas na prática envia
// os bytes em Latin-1/Windows-1252 (confirmado: "COMUNICAÇÃO" chegava
// corrompido decodificando como UTF-8). Decodifica manualmente correto.
async function fetchLatin1(url, options) {
  const resp = await fetch(url, options);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { texto: buffer.toString('latin1'), status: resp.status };
}

function parseDataBr(dataBr) {
  const m = dataBr?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return `${ano}-${mes}-${dia}`;
}

export async function buscarCertidaoMunicipalFeiraDeSantana(cnpj) {
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  const { texto: respostaBusca } = await fetchLatin1(`${BASE_URL}/exec/exe_CertidaodeDebitos.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE_URL}/?pg=servicosonline&Certidao-de-debitos=1`,
    },
    body: `POST_INSCRICAOMUNI=${encodeURIComponent(cnpjLimpo)}`,
  });

  if (/insuficientes/i.test(respostaBusca)) {
    return { sucesso: false, motivo: 'Cadastro municipal incompleto — o portal exige atendimento presencial no CEAF para este contribuinte.' };
  }

  const iframeMatch = respostaBusca.match(/<IFRAME src="([^"]+)"/i);
  if (!iframeMatch) {
    return { sucesso: false, motivo: 'O portal da Prefeitura não reconheceu este CNPJ/inscrição municipal.' };
  }

  const urlCertidao = `${BASE_URL}/imprimir/${iframeMatch[1]}`;
  const { texto: htmlCertidao } = await fetchLatin1(urlCertidao, {
    headers: { 'Referer': `${BASE_URL}/?pg=servicosonline&Certidao-de-debitos=1` },
  });

  // A página mistura entidades HTML (&Atilde;) com bytes crus pros
  // acentos, de forma inconsistente — casa qualquer coisa no lugar da
  // letra acentuada em vez de tentar prever a codificação exata.
  const emissaoMatch = htmlCertidao.match(/DATA DA EMISS.{1,10}O DA CERTID.{1,10}O:[\s\S]{0,150}?<strong>\s*(\d{2}\/\d{2}\/\d{4})/i);
  const validadeMatch = htmlCertidao.match(/DATA DE VALIDADE DA CERTID.{1,10}O:[\s\S]{0,150}?<strong>\s*(\d{2}\/\d{2}\/\d{4})/i);

  if (!validadeMatch) {
    return { sucesso: false, motivo: 'Não foi possível interpretar a certidão retornada pelo portal (o layout pode ter mudado).' };
  }

  return {
    sucesso: true,
    dataEmissao: parseDataBr(emissaoMatch?.[1]),
    dataValidade: parseDataBr(validadeMatch[1]),
    html: htmlCertidao,
    negativa: /CERTID.{1,10}O NEGATIVA/i.test(htmlCertidao),
  };
}
