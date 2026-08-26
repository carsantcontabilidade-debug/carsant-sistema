// Acesso à área logada do portal WebISS (feiradesantanaba.webiss.com.br) só
// para baixar o DANFSE oficial de uma NFS-e já emitida pela CARSANT.
//
// É um mecanismo DIFERENTE da emissão (_webiss-nfse.js), que usa o certificado
// A1 pra assinar o XML enviado por SOAP. Aqui é login comum (usuário/senha)
// na área web do prestador — confirmado por teste real em 29/07/2026 que:
// - O captcha só existe na página pública de "validar nota de terceiros"
//   (/externo/nfse/validar); login e a exportação de PDF não pedem captcha.
// - O mesmo usuário (CPF do Ronaldo) dá acesso a várias empresas — é preciso
//   trocar a "autorização corrente" pra CARSANT depois de logar, senão o
//   perfil ativo fica como tomador (só enxerga notas recebidas).
// - O próprio recurso nativo da Prefeitura "Exportar Lote PDF" (usado na
//   listagem de notas do prestador) devolve um .zip com o PDF oficial da(s)
//   nota(s) filtradas — dá pra filtrar por um número de nota específico.
//
// Arquivo com "_" na frente não conta no teto de 12 Serverless Functions da
// Vercel Hobby (convenção oficial) — é só um módulo auxiliar importado por
// nfse-emitir.js.

import JSZip from 'jszip';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const PORTAL_BASE = 'https://feiradesantanaba.webiss.com.br';
const ID_AUTORIZACAO_CARSANT = process.env.WEBISS_PORTAL_ID_AUTORIZACAO_CARSANT || '95641';

function extrairCookies(resposta) {
  const bruto = typeof resposta.headers.getSetCookie === 'function'
    ? resposta.headers.getSetCookie()
    : (resposta.headers.get('set-cookie') ? [resposta.headers.get('set-cookie')] : []);
  return bruto.map((c) => c.split(';')[0]);
}

function mesclarCookies(jar, novos) {
  for (const par of novos) {
    const [nome] = par.split('=');
    jar.set(nome, par);
  }
}

function cookieHeader(jar) {
  return Array.from(jar.values()).join('; ');
}

async function loginPortal() {
  const usuario = process.env.WEBISS_PORTAL_USUARIO;
  const senha = process.env.WEBISS_PORTAL_SENHA;
  if (!usuario || !senha) throw new Error('WEBISS_PORTAL_USUARIO/WEBISS_PORTAL_SENHA não configurados.');

  const body = new URLSearchParams({ Login: usuario, Senha: senha, IndicaAcessoComCertificado: 'false' });
  const resp = await fetch(`${PORTAL_BASE}/autenticacao/autenticar`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `${PORTAL_BASE}/`,
    },
    body: body.toString(),
  });
  if (resp.status !== 302) throw new Error(`Login no portal WebISS falhou (usuário ou senha incorretos? status ${resp.status}).`);

  const jar = new Map();
  mesclarCookies(jar, extrairCookies(resp));
  if (jar.size === 0) throw new Error('Login no portal WebISS não retornou sessão.');
  return jar;
}

async function trocarParaAutorizacaoCarsant(jar) {
  const resp = await fetch(`${PORTAL_BASE}/controle-acesso/autorizacao-usuario/definir-corrente/${ID_AUTORIZACAO_CARSANT}`, {
    redirect: 'manual',
    headers: { Cookie: cookieHeader(jar) },
  });
  mesclarCookies(jar, extrairCookies(resp));
  if (resp.status >= 400) throw new Error(`Falha ao trocar para o perfil da CARSANT no portal WebISS (status ${resp.status}).`);
}

// Retorna { pdfBase64, nomeArquivo } com o DANFSE oficial, ou lança erro se
// o WebISS não devolver um PDF pra esse número (ex.: nota de homologação,
// que não existe nesta área — só produção).
export async function baixarDanfseOficialPdf(numeroNfse) {
  const jar = await loginPortal();
  await trocarParaAutorizacaoCarsant(jar);

  const body = new URLSearchParams({
    NumeroDaPrimeiraNota: String(numeroNfse),
    NumeroDaUltimaNota: String(numeroNfse),
  });
  const resp = await fetch(`${PORTAL_BASE}/issqn/nfse/pdf/lote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(jar),
    },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Falha ao exportar PDF do portal WebISS (status ${resp.status}).`);

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('zip')) {
    throw new Error('O portal WebISS não retornou um PDF pra esta nota (verifique se é uma nota de produção já visível no prestador).');
  }

  const arrayBuffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const arquivoPdf = Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith('.pdf'));
  if (!arquivoPdf) throw new Error('O arquivo devolvido pelo portal WebISS não continha nenhum PDF.');

  const pdfBuffer = await arquivoPdf.async('nodebuffer');
  return { pdfBase64: pdfBuffer.toString('base64'), nomeArquivo: arquivoPdf.name };
}

// Descobre o ID interno do WebISS pra uma nota (diferente do número da
// NFS-e) — necessário pra montar a URL de visualização abaixo. Vem do
// mesmo endpoint que alimenta a tela "Consultar NFS-e" (grid AJAX).
//
// Duas coisas nada óbvias, confirmadas testando direto contra o portal
// (e, na primeira tentativa, testando errado — ver nota abaixo):
// 1. Sem filtro, esse endpoint devolve só as 10 notas mais recentes
//    (ignora iDisplayLength/iDisplayStart maiores — parece um limite de
//    segurança pra consulta "aberta"), então não dá pra confiar nele pra
//    achar uma nota antiga varrendo página por página.
// 2. O filtro que FUNCIONA é "NumeroDaNota" com o número exatamente como
//    a coluna "Número" da grade mostra (ano + sequencial com 9 dígitos,
//    ex: "2026000000129") — que é o MESMO valor já salvo em
//    notas_fiscais.numero_nfse (o <Numero> do SOAP na emissão já vem
//    nesse formato composto, não é só o sequencial puro). Uma primeira
//    tentativa desta função recebia o ano à parte pra "remontar" esse
//    número — só que ele já vinha completo, e isso duplicava o ano
//    (virava "20262026000000129", nunca encontrado). Testado e corrigido
//    em 26/08/2026 direto contra o portal, incluindo pelo próprio botão
//    do sistema em produção.
async function buscarIdInternoDaNota(jar, numeroNfse) {
  const body = new URLSearchParams({
    iDisplayStart: '0',
    iDisplayLength: '10',
    NumeroDaNota: String(numeroNfse),
  });
  const resp = await fetch(`${PORTAL_BASE}/issqn/nfse/listar/json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: cookieHeader(jar),
    },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Falha ao consultar a nota no portal WebISS (status ${resp.status}).`);
  const { data } = await resp.json();
  const linha = (data || [])[0];
  if (!linha) throw new Error(`Nota ${numeroNfse} não encontrada no portal WebISS.`);
  return linha[linha.length - 1];
}

// Converte o jar de cookies (usado nas chamadas fetch acima) pro formato
// que o Puppeteer espera em page.setCookie() — necessário pro Chromium
// headless carregar como um usuário LOGADO de verdade. Sem isso, a imagem
// do selo fiscal/QR Code (endpoint autenticado
// /gerador-de-selo-fiscal/...) não carregaria dentro do PDF renderizado.
function cookiesParaPuppeteer(jar) {
  return Array.from(jar.values()).map((par) => {
    const igual = par.indexOf('=');
    return {
      name: par.slice(0, igual),
      value: par.slice(igual + 1),
      domain: 'feiradesantanaba.webiss.com.br',
      path: '/',
    };
  });
}

// Gera o PDF oficial de verdade, renderizando a MESMA página de
// visualização que abre quando alguém clica em "Visualizar" na listagem
// do portal e manda imprimir de lá — mas com um navegador headless real
// (Chromium), não uma captura de tela via JS. Isso importa porque essa
// página só fica no layout A4 correto quando o CSS de impressão
// (`@media print`) é de fato aplicado, o que só um motor de impressão de
// navegador de verdade faz corretamente (confirmado em 26/08/2026: tentar
// simular isso via html2canvas + redimensionar o container não funciona —
// a tabela não é responsiva e o selo fiscal/QR Code fica fora da área
// capturada). É DIFERENTE do PDF de "Exportar Lote" usado em
// baixarDanfseOficialPdf acima, que usa um layout de página mais largo e
// corta informação (relatado pelo Ronaldo).
export async function buscarPdfNfseOficialViaRenderizacao(numeroNfse) {
  const jar = await loginPortal();
  await trocarParaAutorizacaoCarsant(jar);
  const idInterno = await buscarIdInternoDaNota(jar, numeroNfse);

  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });

  try {
    const page = await browser.newPage();
    await page.setCookie(...cookiesParaPuppeteer(jar));
    const resp = await page.goto(`${PORTAL_BASE}/issqn/nfse/visualizar/${idInterno}`, { waitUntil: 'networkidle0' });
    if (!resp || !resp.ok()) throw new Error(`Falha ao abrir a nota no portal WebISS (status ${resp?.status()}).`);

    // O portal mostra um modal de aviso (ex.: "Transferência de titularidade
    // de Usuário Master") no primeiro carregamento de uma sessão nova —
    // como aqui SEMPRE é um login novo (um por PDF gerado), esse aviso
    // aparecia em TODO PDF gerado como uma página extra antes da nota
    // (confirmado testando de verdade em 26/08/2026). Esconde qualquer
    // modal Bootstrap antes de imprimir — não é conteúdo da nota.
    await page.addStyleTag({ content: '.modal, .modal-backdrop { display: none !important; }' });

    await page.emulateMediaType('print');
    const pdfBuffer = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    return { pdfBase64: Buffer.from(pdfBuffer).toString('base64'), nomeArquivo: `DANFSe-${numeroNfse}.pdf` };
  } finally {
    await browser.close();
  }
}
