// Integração NFS-e - WebISS Feira de Santana (padrão ABRASF v2.02 IBSCBS)
// Gera e assina a DPS (Declaração de Prestação de Serviço) para emissão de NFS-e.
//
// Segue o mesmo padrão de mTLS/certificado por variável de ambiente usado em
// api/inter-cobranca.js. Antes de usar em produção, preencher os TODOs abaixo
// com os dados cadastrais da CARSANT e a URL do Web Service de homologação/produção.

import https from 'https';
import { SignedXml } from 'xml-crypto';

// ─── Configuração da CARSANT (preencher) ───────────────────────────────────
const CARSANT = {
  cnpj: process.env.CARSANT_CNPJ || 'TODO_CNPJ_SOMENTE_NUMEROS',
  inscricaoMunicipal: process.env.CARSANT_INSCRICAO_MUNICIPAL || 'TODO_INSCRICAO_MUNICIPAL',
  codigoMunicipioIbge: '2910800', // Feira de Santana - BA (tabela IBGE)
  optanteSimplesNacional: 1, // 1-Sim, confirmado por Ronaldo
  incentivoFiscal: 2, // 1-Sim, 2-Não
};

// Códigos de serviço (LC 116/2003) mapeados por atividade da CARSANT.
// O item 1701 é o principal, usado para honorários contábeis.
export const ITENS_LISTA_SERVICO = {
  CONTABILIDADE: '1701', // Serviços de contabilidade, auditoria, revisão de contas, perícia...
  CONSULTORIA: '1705', // Assessoria ou consultoria de qualquer natureza
  PESQUISA_MERCADO: '1706', // Organização, planejamento, assessoria, consultoria e pesquisas de mercado
  APOIO_ADMINISTRATIVO: '1705',
  TREINAMENTO: '0802', // Ensino, treinamento, orientação pedagógica
};

// Endpoints do WebISS Feira de Santana (plataforma IBAM/ABRASF), confirmados
// via WSDL em 14/07/2026 (nfse.wsdl de cada ambiente, elemento soap:address).
// Homologação exige CeC próprio (distinto do CeC de produção) em
// https://homologacao.webiss.com.br/ — ver seção 25 da documentação do projeto.
const WEBISS_URLS = {
  homologacao: process.env.WEBISS_HOMOLOGACAO_URL || 'https://homologacao.webiss.com.br/ws/nfse.asmx',
  producao: process.env.WEBISS_PRODUCAO_URL || 'https://feiradesantanaba.webiss.com.br/ws/nfse.asmx',
};

// Certificado A1 (e-CNPJ da CARSANT) em PEM, cadastrado na Vercel.
const WEBISS_CREDENCIAIS = {
  certPem: process.env.WEBISS_CERT_PEM,
  keyPem: process.env.WEBISS_KEY_PEM,
};

// ─── Helpers de formatação (seguem o padrão de tipos simples do schema ABRASF) ──
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatarValor(v) {
  // Formato 0.00, sem separador de milhar (tsValor)
  return Number(v).toFixed(2);
}

function formatarCompetencia(date = new Date()) {
  // DataEmissao (Rps) é dateTime (AAAA-MM-DDTHH:mm:ss)
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}

function formatarData(date = new Date()) {
  // Competencia é xsd:date (AAAA-MM-DD) no schema pós-Reforma (v2.02 IBSCBS),
  // diferente de DataEmissao que continua dateTime.
  return date.toISOString().slice(0, 10);
}

// ─── Montagem da DPS (InfDeclaracaoPrestacaoServico) ───────────────────────
//
// dados = {
//   rpsNumero, rpsSerie ('1' se não houver série própria), rpsTipo (1-RPS),
//   competencia: Date,
//   valorServicos, aliquota (ex.: 0.02 para 2%), issRetido (1-Sim/2-Não),
//   itemListaServico (ver ITENS_LISTA_SERVICO), discriminacao,
//   tomador: { cnpj, cpf, razaoSocial, endereco: {...}, email } // opcional
// }
export function montarInfDeclaracaoDps(dados) {
  const idTag = `dps_${CARSANT.cnpj}_${dados.rpsSerie}_${dados.rpsNumero}`;
  const valorServicos = formatarValor(dados.valorServicos);
  const aliquota = dados.aliquota != null ? Number(dados.aliquota).toFixed(4) : null;
  const valorIss = dados.aliquota != null
    ? formatarValor(dados.valorServicos * dados.aliquota)
    : null;

  const tomadorXml = dados.tomador ? montarTomadorXml(dados.tomador) : '';

  return `<InfDeclaracaoPrestacaoServico Id="${idTag}">` +
    `<Rps>` +
      `<IdentificacaoRps>` +
        `<Numero>${dados.rpsNumero}</Numero>` +
        `<Serie>${escapeXml(dados.rpsSerie || '1')}</Serie>` +
        `<Tipo>${dados.rpsTipo || 1}</Tipo>` +
      `</IdentificacaoRps>` +
      `<DataEmissao>${formatarCompetencia(dados.dataEmissaoRps || new Date())}</DataEmissao>` +
      `<Status>1</Status>` +
    `</Rps>` +
    `<Competencia>${formatarData(dados.competencia || new Date())}</Competencia>` +
    `<Servico>` +
      `<Valores>` +
        `<ValorServicos>${valorServicos}</ValorServicos>` +
        (valorIss ? `<ValorIss>${valorIss}</ValorIss>` : '') +
        (aliquota ? `<Aliquota>${aliquota}</Aliquota>` : '') +
      `</Valores>` +
      `<IssRetido>${dados.issRetido || 2}</IssRetido>` +
      `<ItemListaServico>${dados.itemListaServico || ITENS_LISTA_SERVICO.CONTABILIDADE}</ItemListaServico>` +
      `<Discriminacao>${escapeXml(dados.discriminacao)}</Discriminacao>` +
      `<CodigoMunicipio>${CARSANT.codigoMunicipioIbge}</CodigoMunicipio>` +
      `<ExigibilidadeISS>1</ExigibilidadeISS>` +
    `</Servico>` +
    `<Prestador>` +
      `<CpfCnpj><Cnpj>${CARSANT.cnpj}</Cnpj></CpfCnpj>` +
      `<InscricaoMunicipal>${CARSANT.inscricaoMunicipal}</InscricaoMunicipal>` +
    `</Prestador>` +
    tomadorXml +
    `<OptanteSimplesNacional>${CARSANT.optanteSimplesNacional}</OptanteSimplesNacional>` +
    `<IncentivoFiscal>${CARSANT.incentivoFiscal}</IncentivoFiscal>` +
  `</InfDeclaracaoPrestacaoServico>`;
}

function montarTomadorXml(tomador) {
  const cpfCnpj = tomador.cnpj
    ? `<Cnpj>${tomador.cnpj}</Cnpj>`
    : tomador.cpf
      ? `<Cpf>${tomador.cpf}</Cpf>`
      : '';

  const enderecoXml = tomador.endereco ? (
    `<Endereco>` +
      `<Endereco>${escapeXml(tomador.endereco.logradouro)}</Endereco>` +
      `<Numero>${escapeXml(tomador.endereco.numero)}</Numero>` +
      (tomador.endereco.complemento ? `<Complemento>${escapeXml(tomador.endereco.complemento)}</Complemento>` : '') +
      `<Bairro>${escapeXml(tomador.endereco.bairro)}</Bairro>` +
      `<CodigoMunicipio>${tomador.endereco.codigoMunicipioIbge}</CodigoMunicipio>` +
      `<Uf>${escapeXml(tomador.endereco.uf)}</Uf>` +
      `<Cep>${tomador.endereco.cep}</Cep>` +
    `</Endereco>`
  ) : '';

  const contatoXml = tomador.email ? `<Contato><Email>${escapeXml(tomador.email)}</Email></Contato>` : '';

  return `<Tomador>` +
    (cpfCnpj ? `<IdentificacaoTomador><CpfCnpj>${cpfCnpj}</CpfCnpj></IdentificacaoTomador>` : '') +
    (tomador.razaoSocial ? `<RazaoSocial>${escapeXml(tomador.razaoSocial)}</RazaoSocial>` : '') +
    enderecoXml +
    contatoXml +
  `</Tomador>`;
}

// ─── Assinatura digital XMLDSig (RSA-SHA1 / C14N, conforme leiaute ABRASF) ──
//
// certPem/keyPem: certificado A1 (.pfx) já convertido para PEM, vindos de
// variável de ambiente na Vercel (mesmo padrão do WEBISS_CERT_PEM / WEBISS_KEY_PEM).
export function assinarInfDeclaracao(infDeclaracaoXml, idTag, { certPem, keyPem }) {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  });

  sig.addReference({
    xpath: `//*[@Id='${idTag}']`,
    uri: `#${idTag}`,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
    ],
  });

  sig.computeSignature(infDeclaracaoXml, {
    location: { reference: `//*[@Id='${idTag}']`, action: 'append' },
  });

  return sig.getSignedXml();
}

// ─── Envelope GerarNfseEnvio (emissão síncrona, uma NFS-e por vez) ─────────
export function montarGerarNfseEnvio(dpsAssinadaXml) {
  return `<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">` +
    `<Rps>${dpsAssinadaXml}</Rps>` +
  `</GerarNfseEnvio>`;
}

// Monta a DPS completa (dados + assinatura), pronta para envio.
// credenciais é opcional: por padrão usa o certificado WEBISS_CERT_PEM/WEBISS_KEY_PEM
// cadastrado na Vercel; passar explicitamente só é necessário em testes locais.
export function montarDpsAssinada(dados, credenciais = WEBISS_CREDENCIAIS) {
  const infXml = montarInfDeclaracaoDps(dados);
  const idTag = `dps_${CARSANT.cnpj}_${dados.rpsSerie || 1}_${dados.rpsNumero}`;
  const dpsAssinada = assinarInfDeclaracao(infXml, idTag, credenciais);
  return montarGerarNfseEnvio(dpsAssinada);
}

// ─── Transporte SOAP — confirmado via WSDL (nfse.wsdl) de cada ambiente ────
//
// Elemento nfseCabecMsg/nfseDadosMsg são strings simples no WSDL (ASP.NET
// .asmx, SOAP 1.1, style document/literal) — o conteúdo XML do padrão ABRASF
// vai dentro delas, como texto escapado. Cabeçalho segue o formato padrão
// ABRASF (cabecalho.xsd), usado por praticamente toda prefeitura no padrão.
function montarCabecalho() {
  return `<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.02">` +
    `<versaoDados>2.02</versaoDados>` +
  `</cabecalho>`;
}

function unescapeXml(str) {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// O WebISS exige intervalo mínimo de 5s entre requisições ao Web Service
// (documentação oficial, 14/07/2026); se violado, ativa um Rate Limit que
// exige 2 minutos sem nenhuma conexão antes de aceitar novas requisições.
// Não há fila/throttling automático aqui pois o uso da CARSANT é de emissão
// unitária diluída ao longo do dia — se no futuro isso passar a ser chamado
// em lote, é necessário espaçar as chamadas em pelo menos 5s.
export async function enviarGerarNfse(envelopeXml, ambiente = 'homologacao') {
  const urlStr = WEBISS_URLS[ambiente];
  if (!urlStr || urlStr.startsWith('TODO_')) {
    throw new Error(`URL do Web Service (${ambiente}) não configurada.`);
  }
  const url = new URL(urlStr);

  const soapBody =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body>` +
        `<GerarNfseRequest xmlns="http://nfse.abrasf.org.br">` +
          `<nfseCabecMsg xmlns="">${escapeXml(montarCabecalho())}</nfseCabecMsg>` +
          `<nfseDadosMsg xmlns="">${escapeXml(envelopeXml)}</nfseDadosMsg>` +
        `</GerarNfseRequest>` +
      `</soap:Body>` +
    `</soap:Envelope>`;

  const agent = new https.Agent({
    cert: WEBISS_CREDENCIAIS.certPem,
    key: WEBISS_CREDENCIAIS.keyPem,
  });

  const outputXml = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://nfse.abrasf.org.br/GerarNfse',
        'Content-Length': Buffer.byteLength(soapBody),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`WebISS retornou HTTP ${res.statusCode}: ${raw.slice(0, 500)}`));
        }
        const match = raw.match(/<outputXML[^>]*>([\s\S]*?)<\/outputXML>/);
        if (!match) {
          return reject(new Error(`Resposta do WebISS sem outputXML: ${raw.slice(0, 500)}`));
        }
        resolve(unescapeXml(match[1]));
      });
    });
    req.on('error', reject);
    req.write(soapBody);
    req.end();
  });

  const erro = outputXml.match(/<ListaMensagemRetorno[\s\S]*?<\/ListaMensagemRetorno>/);
  if (erro) {
    const codigos = [...outputXml.matchAll(/<Codigo>([\s\S]*?)<\/Codigo>/g)].map((m) => m[1]);
    const mensagens = [...outputXml.matchAll(/<Mensagem>([\s\S]*?)<\/Mensagem>/g)].map((m) => m[1]);
    const detalhes = mensagens.map((m, i) => `[${codigos[i] || '?'}] ${m}`).join('; ');
    throw new Error(`WebISS recusou a emissão: ${detalhes || '(sem detalhes)'}\n\n--- XML COMPLETO DA RESPOSTA ---\n${outputXml}`);
  }

  return outputXml;
}
