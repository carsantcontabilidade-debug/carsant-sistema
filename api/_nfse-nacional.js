// Integração com o Emissor Nacional da NFS-e (Sistema Nacional NFS-e / Sefin
// Nacional). DESLIGADA por padrão (ver provedorDeEmissao em nfse-emitir.js):
// em 03/11/2026 o convênio de Feira de Santana tem aderenteEmissorNacional=0,
// então a API recusa a emissão. Fica pronta para quando o município aderir.
//
// Contrato (documentação oficial em gov.br/nfse, "Manual dos Contribuintes —
// Emissor Público API", e leiaute DPS v1.01):
// - mTLS com o certificado ICP-Brasil A1 do contribuinte (o mesmo e-CNPJ já
//   usado no WebISS: WEBISS_CERT_PEM / WEBISS_KEY_PEM);
// - POST {sefin}/SefinNacional/nfse  { dpsXmlGZipB64 } — DPS assinada (XMLDSig
//   sobre infDPS), compactada em GZip e codificada em Base64; resposta
//   síncrona com a NFS-e gerada (nfseXmlGZipB64 + chaveAcesso) ou erros[];
// - POST {sefin}/SefinNacional/nfse/{chave}/eventos
//   { pedidoRegistroEventoXmlGZipB64 } — cancelamento (evento e101101);
// - DANFSe oficial em PDF: GET {adn}/danfse/{chave}.
//
// Arquivo com "_" na frente não conta no teto de 12 Serverless Functions da
// Vercel Hobby (é só um módulo importado por nfse-emitir.js).

import https from 'https';
import zlib from 'zlib';
import { SignedXml } from 'xml-crypto';

const NS = 'http://www.sped.fazenda.gov.br/nfse';
const VER_APLIC = 'CARSANT-1.0';

// A série da DPS identifica quem gerou: as notas emitidas aqui usam a série 2
// (faixa 00001–49999 = "aplicativo próprio"); a série 1 ficou com o WebISS.
// nfse-emitir.js usa isso para saber de qual emissor é cada nota já salva.
export const SERIE_NACIONAL = '2';

const AMBIENTES = {
  producao: { sefin: 'sefin.nfse.gov.br', adn: 'adn.nfse.gov.br', bases: ['/SefinNacional'], tpAmb: '1' },
  // O Swagger da produção restrita fica em /API/SefinNacional; bibliotecas
  // abertas usam /SefinNacional — tenta os dois caminhos.
  homologacao: {
    sefin: 'sefin.producaorestrita.nfse.gov.br',
    adn: 'adn.producaorestrita.nfse.gov.br',
    bases: ['/SefinNacional', '/API/SefinNacional'],
    tpAmb: '2',
  },
};

const CARSANT = {
  cnpj: process.env.CARSANT_CNPJ,
  inscricaoMunicipal: process.env.CARSANT_INSCRICAO_MUNICIPAL,
  codigoMunicipioIbge: '2910800', // Feira de Santana - BA
  // 17.19.01 — Contabilidade, inclusive serviços técnicos e auxiliares
  // (Lista Nacional de Serviços, Anexo B do manual).
  codigoTributacaoNacional: '171901',
  // Percentual aproximado de tributos do Simples Nacional exibido na nota
  // (Lei 12.741/2012, campo pTotTribSN — obrigatório para ME/EPP). Só
  // informativo; ajustar na Vercel (CARSANT_PTOTTRIBSN) se a alíquota efetiva
  // do Simples da CARSANT for outra.
  pTotTribSN: process.env.CARSANT_PTOTTRIBSN || '6.00',
};

function configAmbiente(ambiente) {
  return AMBIENTES[ambiente === 'producao' ? 'producao' : 'homologacao'];
}

function credenciais() {
  const corrigir = (s) => (s ? s.replace(/\\n/g, '\n') : s);
  const certPem = corrigir(process.env.WEBISS_CERT_PEM);
  const keyPem = corrigir(process.env.WEBISS_KEY_PEM);
  if (!certPem || !keyPem) {
    throw new Error('Certificado digital A1 da CARSANT não configurado no servidor (WEBISS_CERT_PEM / WEBISS_KEY_PEM).');
  }
  return { certPem, keyPem };
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

// "AAAA-MM-DDThh:mm:ss-03:00" no fuso de Brasília (sem horário de verão
// desde 2019). O servidor da Vercel roda em UTC.
function dataHoraBrasilia(data = new Date()) {
  const texto = data.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }); // "2026-11-03 14:05:01"
  return `${texto.replace(' ', 'T')}-03:00`;
}

function dataBrasilia(data = new Date()) {
  return data.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function idDps({ serie, nDps }) {
  const cnpj = soDigitos(CARSANT.cnpj).padStart(14, '0');
  return `DPS${CARSANT.codigoMunicipioIbge}2${cnpj}${String(serie).padStart(5, '0')}${String(nDps).padStart(15, '0')}`;
}

// ─── Montagem da DPS (leiaute DPS v1.01) ───────────────────────────────────
//
// Regras do emitente = prestador (tpEmit = 1) que valem aqui, conforme as
// regras de negócio do Anexo I: o prestador NÃO informa nome nem endereço
// (vêm do cadastro nacional — E0121/E0128); ME/EPP optante com apuração pelo
// Simples (regApTribSN = 1) usa regEspTrib = 0 (E0175), não informa pAliq sem
// retenção (E0625) e informa pTotTribSN, nunca indTotTrib (E0712).
function montarTomadorXml(tomador) {
  if (!tomador) return '';
  // O cadastro do cliente guarda CPF ou CNPJ no mesmo campo — decide pelo
  // tamanho (11 = CPF, 14 = CNPJ).
  const digitosDoc = soDigitos(tomador.cnpj || tomador.cpf);
  const ehCnpj = digitosDoc.length === 14;
  const doc = digitosDoc.length === 14 ? `<CNPJ>${digitosDoc}</CNPJ>` : digitosDoc.length === 11 ? `<CPF>${digitosDoc}</CPF>` : '';
  if (!doc) return '';

  let endXml = '';
  const e = tomador.endereco;
  if (e) {
    const cep = soDigitos(e.cep);
    const cMun = soDigitos(e.codigoMunicipioIbge);
    if (cep.length !== 8) throw new Error('CEP do tomador inválido (precisa ter 8 dígitos) — corrija no cadastro do cliente.');
    if (cMun.length !== 7) throw new Error('Código IBGE do município do tomador inválido — corrija no cadastro do cliente.');
    endXml = '<end>' +
      `<endNac><cMun>${cMun}</cMun><CEP>${cep}</CEP></endNac>` +
      `<xLgr>${escapeXml(e.logradouro)}</xLgr>` +
      `<nro>${escapeXml(e.numero || 'S/N')}</nro>` +
      (e.complemento ? `<xCpl>${escapeXml(e.complemento)}</xCpl>` : '') +
      `<xBairro>${escapeXml(e.bairro)}</xBairro>` +
    '</end>';
  } else if (ehCnpj) {
    // E0235: tomador identificado por CNPJ exige endereço nacional.
    throw new Error('Tomador com CNPJ precisa de endereço cadastrado (exigência do Emissor Nacional) — complete o cadastro do cliente.');
  }

  const fone = soDigitos(tomador.telefone);
  return '<toma>' +
    doc +
    `<xNome>${escapeXml(tomador.razaoSocial)}</xNome>` +
    endXml +
    (fone.length >= 6 && fone.length <= 20 ? `<fone>${fone}</fone>` : '') +
    (tomador.email ? `<email>${escapeXml(String(tomador.email).slice(0, 80))}</email>` : '') +
  '</toma>';
}

// dados = { ambiente, rpsSerie, rpsNumero, competencia ('AAAA-MM-DD' ou Date),
//           valorServicos, discriminacao, tomador: {...},
//           substituicao?: { chave, motivo } }
// `im`: inscrição municipal a enviar (null = não enviar) — ver emitirNfseNacional.
// `finNFSe`: o esquema de PRODUÇÃO RESTRITA (v1.01 de 20/10/2026, já com os
// grupos IBS/CBS) exige <finNFSe>0</finNFSe> (nota regular) logo depois de
// tpEmit; o de produção atual (v1.01 de 09/02/2026) não tem esse campo e
// rejeita se vier. Ver finNFSePadrao() e o reenvio em emitirNfseNacional.
export function montarDpsNacional(dados, im, finNFSe = false) {
  const cfg = configAmbiente(dados.ambiente);
  const serie = String(dados.rpsSerie || SERIE_NACIONAL);
  const nDps = String(dados.rpsNumero);
  const id = idDps({ serie, nDps });

  const competencia = typeof dados.competencia === 'string'
    ? dados.competencia.slice(0, 10)
    : dataBrasilia(dados.competencia || new Date());

  // dhEmi precisa ser <= o instante em que o servidor deles processa; um
  // minuto de folga evita E0008 por diferença de relógio.
  const dhEmi = dataHoraBrasilia(new Date(Date.now() - 60 * 1000));

  const sub = dados.substituicao
    ? '<subst>' +
        `<chSubstda>${soDigitos(dados.substituicao.chave)}</chSubstda>` +
        '<cMotivo>99</cMotivo>' +
        `<xMotivo>${escapeXml(String(dados.substituicao.motivo || '').slice(0, 255))}</xMotivo>` +
      '</subst>'
    : '';

  const descricao = String(dados.discriminacao || '').slice(0, 1000);

  return `<DPS xmlns="${NS}" versao="1.01">` +
    `<infDPS Id="${id}">` +
      `<tpAmb>${cfg.tpAmb}</tpAmb>` +
      `<dhEmi>${dhEmi}</dhEmi>` +
      `<verAplic>${VER_APLIC}</verAplic>` +
      `<serie>${Number(serie)}</serie>` +
      `<nDPS>${nDps}</nDPS>` +
      `<dCompet>${competencia}</dCompet>` +
      '<tpEmit>1</tpEmit>' +
      (finNFSe ? '<finNFSe>0</finNFSe>' : '') +
      `<cLocEmi>${CARSANT.codigoMunicipioIbge}</cLocEmi>` +
      sub +
      '<prest>' +
        `<CNPJ>${soDigitos(CARSANT.cnpj)}</CNPJ>` +
        (im ? `<IM>${im}</IM>` : '') +
        '<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib>' +
      '</prest>' +
      montarTomadorXml(dados.tomador) +
      '<serv>' +
        `<locPrest><cLocPrestacao>${CARSANT.codigoMunicipioIbge}</cLocPrestacao></locPrest>` +
        `<cServ><cTribNac>${CARSANT.codigoTributacaoNacional}</cTribNac><xDescServ>${escapeXml(descricao)}</xDescServ></cServ>` +
      '</serv>' +
      '<valores>' +
        `<vServPrest><vServ>${Number(dados.valorServicos).toFixed(2)}</vServ></vServPrest>` +
        '<trib>' +
          '<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>' +
          `<totTrib><pTotTribSN>${CARSANT.pTotTribSN}</pTotTribSN></totTrib>` +
        '</trib>' +
      '</valores>' +
    '</infDPS>' +
  '</DPS>';
}

// ─── Assinatura XMLDSig ─────────────────────────────────────────────────────
// Assina o elemento que tem o atributo Id (infDPS / infPedReg); a <Signature>
// entra como irmã dele, dentro do elemento raiz (leiaute: infDPS, Signature).
function assinar(xml, id, { certPem, keyPem }) {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  });
  sig.addReference({
    xpath: `//*[@Id='${id}']`,
    uri: `#${id}`,
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  });
  sig.computeSignature(xml, { location: { reference: `//*[@Id='${id}']`, action: 'after' } });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${sig.getSignedXml()}`;
}

export function montarDpsAssinada(dados, im, cred, finNFSe = false) {
  const id = idDps({ serie: dados.rpsSerie || SERIE_NACIONAL, nDps: dados.rpsNumero });
  return assinar(montarDpsNacional(dados, im, finNFSe), id, cred);
}

// Padrão por ambiente (NFSE_NACIONAL_FINNFSE=1/0 força). Se o servidor
// responder E1235 (falha de esquema), emitirNfseNacional tenta o contrário.
function finNFSePadrao(ambiente) {
  if (process.env.NFSE_NACIONAL_FINNFSE === '1') return true;
  if (process.env.NFSE_NACIONAL_FINNFSE === '0') return false;
  return ambiente === 'homologacao';
}

const gzipBase64 = (xml) => zlib.gzipSync(Buffer.from(xml, 'utf8'), { level: 9 }).toString('base64');
const gunzipBase64 = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');

// ─── HTTP (mTLS) ────────────────────────────────────────────────────────────
function requisitar({ host, path, method = 'GET', body, accept = 'application/json' }, { certPem, keyPem }) {
  return new Promise((resolve, reject) => {
    const dados = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      hostname: host,
      path,
      method,
      cert: certPem,
      key: keyPem,
      timeout: 30000,
      headers: {
        Accept: accept,
        ...(dados ? { 'Content-Type': 'application/json', 'Content-Length': dados.length } : {}),
      },
    }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => resolve({ status: res.statusCode, tipo: res.headers['content-type'] || '', corpo: Buffer.concat(partes) }));
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao falar com o Emissor Nacional (tente de novo).')));
    req.on('error', (err) => reject(new Error(`Falha de conexão com o Emissor Nacional: ${err.message}`)));
    if (dados) req.write(dados);
    req.end();
  });
}

async function postarSefin(ambiente, sufixo, body, cred) {
  const cfg = configAmbiente(ambiente);
  let resposta;
  for (const base of cfg.bases) {
    resposta = await requisitar({ host: cfg.sefin, path: `${base}${sufixo}`, method: 'POST', body }, cred);
    if (resposta.status !== 404) return resposta;
  }
  return resposta;
}

function lerJson(resposta) {
  try { return JSON.parse(resposta.corpo.toString('utf8')); } catch { return null; }
}

function extrairErros(json) {
  if (!json) return [];
  const lista = json.erros ?? json.erro ?? [];
  return (Array.isArray(lista) ? lista : [lista])
    .filter(Boolean)
    .map((e) => {
      // Campos além de código/descrição (ex.: complemento com o elemento XML
      // que falhou no esquema) entram na mensagem — ajudam a diagnosticar.
      const extras = typeof e === 'object'
        ? Object.entries(e).filter(([k, v]) => !/^(codigo|descricao|mensagem)$/i.test(k) && v != null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('; ')
        : '';
      const descricao = String(e.Descricao ?? e.descricao ?? e.mensagem ?? e);
      return {
        codigo: String(e.Codigo ?? e.codigo ?? ''),
        descricao: extras ? `${descricao} (${extras})` : descricao,
      };
    });
}

function mensagemDeFalha(resposta, json, erros) {
  if (erros.length) return erros.map((e) => (e.codigo ? `[${e.codigo}] ${e.descricao}` : e.descricao)).join('; ');
  const generica = json?.mensagem || json?.message || json?.title || json?.detail;
  if (generica) return String(generica);
  const trecho = resposta.corpo.toString('utf8').replace(/\s+/g, ' ').slice(0, 300);
  return `HTTP ${resposta.status}${trecho ? ` — ${trecho}` : ''}`;
}

// ─── Emissão ────────────────────────────────────────────────────────────────
// O cadastro nacional (CNC) decide se a inscrição municipal deve ou não ir na
// DPS (E0198/E0200) e ela pode estar gravada com zeros à esquerda (E0116).
// Tenta: IM com 15 dígitos → IM como está → sem IM, só avançando quando o erro
// fala da inscrição municipal.
function variantesInscricaoMunicipal() {
  const bruta = soDigitos(CARSANT.inscricaoMunicipal);
  if (!bruta) return [null];
  const lista = [bruta.padStart(15, '0')];
  if (bruta !== lista[0]) lista.push(bruta);
  lista.push(null);
  return lista;
}

const erroDeInscricaoMunicipal = (erros) => erros.some((e) => /inscri[cç][aã]o municipal|indicador municipal|\bIM\b/i.test(e.descricao));

export async function emitirNfseNacional(dados) {
  const ambiente = dados.ambiente === 'producao' ? 'producao' : 'homologacao';
  const cred = credenciais();
  if (!soDigitos(CARSANT.cnpj)) throw new Error('CNPJ da CARSANT não configurado no servidor (CARSANT_CNPJ).');

  let falha = 'Resposta inesperada do Emissor Nacional.';
  const finInicial = finNFSePadrao(ambiente);
  for (const fin of [finInicial, !finInicial]) {
    let tentarOutroEsquema = false;
    for (const im of variantesInscricaoMunicipal()) {
      const xml = montarDpsAssinada({ ...dados, ambiente }, im, cred, fin);
      const resposta = await postarSefin(ambiente, '/nfse', { dpsXmlGZipB64: gzipBase64(xml) }, cred);
      const json = lerJson(resposta);
      const erros = extrairErros(json);

      if (json?.nfseXmlGZipB64 && json?.chaveAcesso && erros.length === 0) {
        const nfseXml = gunzipBase64(json.nfseXmlGZipB64);
        return {
          numero: nfseXml.match(/<nNFSe>(\d+)<\/nNFSe>/)?.[1] || null,
          chaveAcesso: json.chaveAcesso,
          dataEmissao: nfseXml.match(/<dhProc>([^<]+)<\/dhProc>/)?.[1] || null,
          xml: nfseXml,
          alertas: json.alertas || null,
        };
      }

      falha = mensagemDeFalha(resposta, json, erros);
      if (erros.some((e) => e.codigo === 'E1235')) { tentarOutroEsquema = true; break; }
      if (!erroDeInscricaoMunicipal(erros)) throw new Error(`Emissor Nacional recusou a emissão: ${falha}`);
    }
    if (!tentarOutroEsquema) break;
  }
  throw new Error(`Emissor Nacional recusou a emissão: ${falha}`);
}

// ─── Cancelamento (evento e101101) ──────────────────────────────────────────
// codigoMotivo: 1 = erro na emissão, 2 = serviço não prestado, 9 = outros.
// xMotivo precisa ter de 15 a 255 caracteres.
export async function cancelarNfseNacional({ chaveAcesso, codigoMotivo = '1', motivo, ambiente }) {
  const amb = ambiente === 'producao' ? 'producao' : 'homologacao';
  const cfg = configAmbiente(amb);
  const cred = credenciais();
  const chave = soDigitos(chaveAcesso);
  if (chave.length !== 50) throw new Error('Esta nota não tem a chave de acesso nacional registrada — não é possível cancelar.');
  const xMotivo = String(motivo || 'Cancelamento solicitado pelo escritório').padEnd(15, '.').slice(0, 255);
  const id = `PRE${chave}101101`;

  const xml = assinar(
    `<pedRegEvento xmlns="${NS}" versao="1.01">` +
      `<infPedReg Id="${id}">` +
        `<tpAmb>${cfg.tpAmb}</tpAmb>` +
        `<verAplic>${VER_APLIC}</verAplic>` +
        `<dhEvento>${dataHoraBrasilia(new Date(Date.now() - 60 * 1000))}</dhEvento>` +
        `<CNPJAutor>${soDigitos(CARSANT.cnpj)}</CNPJAutor>` +
        `<chNFSe>${chave}</chNFSe>` +
        '<e101101>' +
          '<xDesc>Cancelamento de NFS-e</xDesc>' +
          `<cMotivo>${codigoMotivo}</cMotivo>` +
          `<xMotivo>${escapeXml(xMotivo)}</xMotivo>` +
        '</e101101>' +
      '</infPedReg>' +
    '</pedRegEvento>',
    id,
    cred,
  );

  const resposta = await postarSefin(amb, `/nfse/${chave}/eventos`, { pedidoRegistroEventoXmlGZipB64: gzipBase64(xml) }, cred);
  const json = lerJson(resposta);
  const erros = extrairErros(json);
  if (resposta.status >= 200 && resposta.status < 300 && erros.length === 0) return { json };
  throw new Error(`Emissor Nacional recusou o cancelamento: ${mensagemDeFalha(resposta, json, erros)}`);
}

// ─── Diagnóstico: parâmetros municipais (somente leitura) ───────────────────
// Consulta o convênio do município e os parâmetros do serviço nos dois
// ambientes, testando os caminhos candidatos (o manual dá só o sufixo
// /parametros_municipais/{codigoMunicipio}/...). Usado para entender recusas
// como E0037 ("município emissor inexistente no cadastro de convênio").
export async function consultarParametrosMunicipais() {
  const cred = credenciais();
  const cMun = CARSANT.codigoMunicipioIbge;
  const resultado = {};
  for (const ambiente of ['producao', 'homologacao']) {
    const cfg = AMBIENTES[ambiente];
    // Municípios de controle (Salvador e São Paulo, sabidamente conveniados):
    // se eles respondem e Feira de Santana não, o município está fora da lista;
    // se todos dão 404, o caminho é que está errado.
    const candidatos = [];
    for (const m of [cMun, '2927408', '3550308']) {
      candidatos.push({ host: cfg.adn, path: `/parametrizacao/parametros_municipais/${m}/convenio` });
      candidatos.push({ host: cfg.adn, path: `/parametrizacao/${m}/convenio` });
      candidatos.push({ host: cfg.adn, path: `/parametrizacao/parametros_municipais/${m}/convenio/` });
    }
    candidatos.push({ host: cfg.adn, path: `/parametrizacao/parametros_municipais/${cMun}/${CARSANT.codigoTributacaoNacional}` });
    candidatos.push({ host: cfg.adn, path: '/parametrizacao/docs/index.html' });
    candidatos.push({ host: cfg.adn, path: '/parametrizacao/swagger/v1/swagger.json' });
    resultado[ambiente] = await Promise.all(candidatos.map(async (c) => {
      try {
        const r = await requisitar({ ...c, method: 'GET' }, cred);
        return { url: `https://${c.host}${c.path}`, status: r.status, corpo: r.corpo.toString('utf8').replace(/\s+/g, ' ').slice(0, 700) };
      } catch (err) {
        return { url: `https://${c.host}${c.path}`, erro: err.message };
      }
    }));
  }
  return resultado;
}

// ─── DANFSe oficial ─────────────────────────────────────────────────────────
export async function baixarDanfseNacional({ chaveAcesso, ambiente }) {
  const cfg = configAmbiente(ambiente);
  const chave = soDigitos(chaveAcesso);
  const resposta = await requisitar({ host: cfg.adn, path: `/danfse/${chave}`, accept: 'application/pdf' }, credenciais());
  const ehPdf = resposta.tipo.includes('pdf') || resposta.corpo.subarray(0, 4).toString() === '%PDF';
  if (resposta.status !== 200 || !ehPdf) {
    throw new Error(`O Emissor Nacional não devolveu o DANFSe desta nota (HTTP ${resposta.status}).`);
  }
  return { pdfBase64: resposta.corpo.toString('base64'), nomeArquivo: `DANFSe-${chave}.pdf` };
}
