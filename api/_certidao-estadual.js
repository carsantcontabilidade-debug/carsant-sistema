// Importa o módulo interno, não o pacote raiz: o index.js do pdf-parse
// 1.x tem um bloco de "modo debug" que roda ao carregar (lê um PDF de
// teste que não existe fora do repo do pacote) quando `module.parent`
// vem vazio — o que acontece ao importar via ESM. O caminho interno
// evita esse código morto por completo.
import pdf from 'pdf-parse/lib/pdf-parse.js';

// Emissão automática da Certidão Negativa de Débitos Tributários —
// SEFAZ Bahia (estadual).
//
// Confirmado por teste real (CNPJ público, 25/07/2026): sem captcha,
// mas é ASP.NET WebForms clássico (precisa capturar __VIEWSTATE/
// __EVENTVALIDATION do GET e reenviar no POST, com o mesmo cookie de
// sessão). O botão "Imprimir" não devolve a certidão na resposta —
// ele só marca no servidor qual certidão gerar; o PDF de fato sai de
// uma segunda página (Relatorio.aspx) usando a mesma sessão.

const BASE = 'https://servicos.sefaz.ba.gov.br/sistemas/DSCRE/Modulos/Publico/EmissaoCertidao.aspx';
const RELATORIO_URL = 'https://servicos.sefaz.ba.gov.br/sistemas/DSCRE/Relatorios/Relatorio.aspx';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const DIAS_VALIDADE = 60; // Portaria SEFAZ-BA nº 918/99, confirmado no texto real da certidão.

function extrairCampo(html, id) {
  const m = html.match(new RegExp(`id="${id}" value="([^"]*)"`));
  return m ? m[1] : '';
}

function parseDataBr(dataBr) {
  const m = dataBr?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return `${ano}-${mes}-${dia}`;
}

function somarDias(dataIso, dias) {
  const data = new Date(`${dataIso}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

export async function buscarCertidaoEstadualBahia(cnpj) {
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  const getResp = await fetch(BASE, { headers: { 'User-Agent': USER_AGENT } });
  const cookie = getResp.headers.get('set-cookie')?.split(';')[0];
  const html = await getResp.text();

  const viewstate = extrairCampo(html, '__VIEWSTATE');
  const viewstategen = extrairCampo(html, '__VIEWSTATEGENERATOR');
  const eventvalidation = extrairCampo(html, '__EVENTVALIDATION');
  if (!cookie || !viewstate) {
    return { sucesso: false, motivo: 'Não foi possível iniciar sessão no portal da SEFAZ-BA (o site pode ter mudado).' };
  }

  const body = new URLSearchParams({
    __EVENTTARGET: 'ctl00$PHConteudo$btnImprimir',
    __EVENTARGUMENT: '',
    __VIEWSTATE: viewstate,
    __VIEWSTATEGENERATOR: viewstategen,
    __EVENTVALIDATION: eventvalidation,
    'ctl00$PHConteudo$TxtNumCNPJ': cnpjLimpo,
    'ctl00$PHConteudo$TxtNumCPF': '',
    'ctl00$PHConteudo$TxtNumInscricaoEstadual': '',
  });

  await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
      'Referer': BASE,
      'User-Agent': USER_AGENT,
    },
    body: body.toString(),
  });

  const relResp = await fetch(RELATORIO_URL, {
    headers: { 'Cookie': cookie, 'Referer': BASE, 'User-Agent': USER_AGENT },
  });

  const contentType = relResp.headers.get('content-type') || '';
  if (!contentType.includes('application/pdf')) {
    return { sucesso: false, motivo: 'O portal da SEFAZ-BA não retornou a certidão para este CNPJ (dados podem estar incorretos ou o site mudou).' };
  }

  const pdfBuffer = Buffer.from(await relResp.arrayBuffer());
  const parsed = await pdf(pdfBuffer);

  const emissaoMatch = parsed.text.match(/Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const dataEmissao = emissaoMatch ? parseDataBr(emissaoMatch[1]) : new Date().toISOString().slice(0, 10);

  return {
    sucesso: true,
    dataEmissao,
    dataValidade: somarDias(dataEmissao, DIAS_VALIDADE),
    pdfBuffer,
    negativa: /n[ãa]o constam[\s\S]{0,40}pend[êe]ncias/i.test(parsed.text),
  };
}
