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
  inscricaoEstadual: '143275161', // Confirmada em NFS-e real da CARSANT
  codigoMunicipioIbge: '2910800', // Feira de Santana - BA (tabela IBGE)
  codigoCnae: '6920601', // Atividades de contabilidade (confirmado em NFS-e real da CARSANT)
  optanteSimplesNacional: 1, // 1-Sim, confirmado por Ronaldo
  incentivoFiscal: 2, // 1-Sim, 2-Não
  regimeEspecialTributacao: 6, // 6-ME/EPP (Simples Nacional, CARSANT é LTDA, não MEI)
  // Alíquota efetiva atual do ISS pelo Simples Nacional, confirmada em duas
  // NFS-e reais já emitidas (produção e homologação, ambas com Aliquota=2%
  // na resposta). Enviar explicitamente evita que o WebISS tente calcular
  // sozinho — parece que só a aplicação web deles faz esse cálculo, não o
  // webservice de terceiros.
  aliquotaSimplesNacional: 0.02,
};

// Em homologação, o cadastro de teste da CARSANT no WebISS usa um código de
// município fictício ("9999999"/UF "HM"), não o código real de Feira de
// Santana — confirmado emitindo uma NFS-e de teste direto pelo portal deles.
// Usar o código real em homologação gera "Tipo de atividade incompatível com
// o Município de Incidência" porque não bate com o cadastro de teste.
const MUNICIPIO_HOMOLOGACAO = { codigo: '9999999' };

function codigoMunicipioPrestador(ambiente) {
  return ambiente === 'homologacao' ? MUNICIPIO_HOMOLOGACAO.codigo : CARSANT.codigoMunicipioIbge;
}

// Códigos de serviço (LC 116/2003) mapeados por atividade da CARSANT.
// 1719 é o item usado de fato pela CARSANT (confirmado em NFS-e real já
// emitida), não 1701 como assumido antes.
export const ITENS_LISTA_SERVICO = {
  CONTABILIDADE: '1719', // Confirmado em NFS-e real da CARSANT (Assessoria e Consultoria Contábil)
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

function formatarData(date = new Date()) {
  // Uma string "AAAA-MM-DD" (ex.: vinda de <input type="date">) já é uma
  // data pura, sem componente de hora/fuso — repassar direto, sem conversão.
  // Só um objeto Date (que representa um instante, tipicamente "agora") passa
  // pela conversão de fuso abaixo.
  if (typeof date === 'string') return date;
  // Usa o fuso de Brasília explicitamente: toISOString() é sempre UTC, e o
  // servidor (Vercel) roda em UTC — perto da meia-noite BRT, a data em UTC já
  // vira o dia seguinte, fazendo o WebISS rejeitar como "emissão no futuro".
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
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
  // aliquotaFracao é usada só para calcular ValorIss (0.02 = 2% de 500 = 10).
  // O campo <Aliquota> em si é em escala percentual direta (2, não 0.02) —
  // confirmado na resposta de NFS-e reais da CARSANT (<Aliquota>2</Aliquota>).
  const aliquotaFracao = dados.aliquota != null ? Number(dados.aliquota) : CARSANT.aliquotaSimplesNacional;
  const aliquota = aliquotaFracao != null ? (aliquotaFracao * 100).toFixed(4) : null;
  const valorIss = aliquotaFracao != null
    ? formatarValor(dados.valorServicos * aliquotaFracao)
    : null;
  const codigoMunicipio = codigoMunicipioPrestador(dados.ambiente);

  const tomadorXml = dados.tomador ? montarTomadorXml(dados.tomador) : '';

  // O namespace precisa estar explícito aqui (não só herdado de um elemento
  // pai mais externo) porque a assinatura digital é calculada sobre este
  // fragmento isoladamente — se o namespace só existir por herança quando o
  // fragmento for embutido no envelope depois, o C14N na hora de assinar e
  // na hora de validar produzem bytes diferentes e a assinatura não bate.
  return `<InfDeclaracaoPrestacaoServico xmlns="http://www.abrasf.org.br/nfse.xsd" Id="${idTag}">` +
    `<Rps>` +
      `<IdentificacaoRps>` +
        `<Numero>${dados.rpsNumero}</Numero>` +
        `<Serie>${escapeXml(dados.rpsSerie || '1')}</Serie>` +
        `<Tipo>${dados.rpsTipo || 1}</Tipo>` +
      `</IdentificacaoRps>` +
      `<DataEmissao>${formatarData(dados.dataEmissaoRps || new Date())}</DataEmissao>` +
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
      `<CodigoCnae>${dados.codigoCnae || CARSANT.codigoCnae}</CodigoCnae>` +
      `<CodigoTributacaoMunicipio>${dados.itemListaServico || ITENS_LISTA_SERVICO.CONTABILIDADE}</CodigoTributacaoMunicipio>` +
      `<Discriminacao>${escapeXml(dados.discriminacao)}</Discriminacao>` +
      `<CodigoMunicipio>${codigoMunicipio}</CodigoMunicipio>` +
      `<ExigibilidadeISS>1</ExigibilidadeISS>` +
      `<MunicipioIncidencia>${codigoMunicipio}</MunicipioIncidencia>` +
    `</Servico>` +
    `<Prestador>` +
      `<CpfCnpj><Cnpj>${CARSANT.cnpj}</Cnpj></CpfCnpj>` +
      `<InscricaoMunicipal>${CARSANT.inscricaoMunicipal}</InscricaoMunicipal>` +
      `<InscricaoEstadual>${CARSANT.inscricaoEstadual}</InscricaoEstadual>` +
    `</Prestador>` +
    tomadorXml +
    (CARSANT.regimeEspecialTributacao ? `<RegimeEspecialTributacao>${CARSANT.regimeEspecialTributacao}</RegimeEspecialTributacao>` : '') +
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
      `<CodigoPais>${tomador.endereco.codigoPais || '1058'}</CodigoPais>` +
      `<Cep>${tomador.endereco.cep}</Cep>` +
    `</Endereco>`
  ) : '';

  const contatoXml = (tomador.telefone || tomador.email) ? (
    `<Contato>` +
      (tomador.telefone ? `<Telefone>${escapeXml(tomador.telefone)}</Telefone>` : '') +
      (tomador.email ? `<Email>${escapeXml(tomador.email)}</Email>` : '') +
    `</Contato>`
  ) : '';

  const identificacaoTomadorXml = (cpfCnpj || tomador.inscricaoMunicipal || tomador.inscricaoEstadual) ? (
    `<IdentificacaoTomador>` +
      (cpfCnpj ? `<CpfCnpj>${cpfCnpj}</CpfCnpj>` : '') +
      (tomador.inscricaoMunicipal ? `<InscricaoMunicipal>${escapeXml(tomador.inscricaoMunicipal)}</InscricaoMunicipal>` : '') +
      (tomador.inscricaoEstadual ? `<InscricaoEstadual>${escapeXml(tomador.inscricaoEstadual)}</InscricaoEstadual>` : '') +
    `</IdentificacaoTomador>`
  ) : '';

  return `<Tomador>` +
    identificacaoTomadorXml +
    (tomador.razaoSocial ? `<RazaoSocial>${escapeXml(tomador.razaoSocial)}</RazaoSocial>` : '') +
    enderecoXml +
    contatoXml +
  `</Tomador>`;
}

// ─── Assinatura digital XMLDSig (RSA-SHA1 / C14N, conforme leiaute ABRASF) ──
//
// certPem/keyPem: certificado A1 (.pfx) já convertido para PEM, vindos de
// variável de ambiente na Vercel (mesmo padrão do WEBISS_CERT_PEM / WEBISS_KEY_PEM).
//
// O tipo tcDeclaracaoPrestacaoServico do XSD do WebISS define Rps como
// InfDeclaracaoPrestacaoServico seguido de Signature como elementos IRMÃOS
// (não a Signature aninhada dentro do InfDeclaracaoPrestacaoServico) — por
// isso o wrapper <Rps> é montado aqui, antes de assinar, com action:'after'
// para a assinatura ser inserida depois do InfDeclaracaoPrestacaoServico.
export function assinarInfDeclaracao(infDeclaracaoXml, idTag, { certPem, keyPem }) {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    // Confirmado via XML de uma NFS-e real já emitida pela CARSANT
    // (assinatura da tag <Signature> da resposta): SHA-1 mesmo, não SHA-256.
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  });

  sig.addReference({
    xpath: `//*[@Id='${idTag}']`,
    uri: `#${idTag}`,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    // Ordem importa: enveloped-signature (remove o próprio <Signature> do
    // cálculo) precisa vir antes do c14n (canonicaliza o que sobrou) — na
    // ordem inversa a assinatura seria calculada sobre bytes já serializados,
    // sem sentido para uma transform que opera removendo nós do XML.
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  });

  const rpsXml = `<Rps>${infDeclaracaoXml}</Rps>`;

  sig.computeSignature(rpsXml, {
    location: { reference: `//*[@Id='${idTag}']`, action: 'after' },
  });

  return sig.getSignedXml();
}

// ─── Envelope GerarNfseEnvio (emissão síncrona, uma NFS-e por vez) ─────────
// dpsAssinadaXml já vem envelopado em <Rps>...</Rps> por assinarInfDeclaracao.
export function montarGerarNfseEnvio(dpsAssinadaXml) {
  return `<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">${dpsAssinadaXml}</GerarNfseEnvio>`;
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
//
// Genérico para qualquer operação do webservice (GerarNfse, ConsultarNfse...)
// — todas seguem o mesmo padrão de envelope (nfseCabecMsg/nfseDadosMsg como
// strings simples, confirmado via WSDL para cada operação).
async function enviarOperacaoWebiss(operacao, envelopeXml, ambiente = 'homologacao') {
  const urlStr = WEBISS_URLS[ambiente];
  if (!urlStr || urlStr.startsWith('TODO_')) {
    throw new Error(`URL do Web Service (${ambiente}) não configurada.`);
  }
  const url = new URL(urlStr);

  const soapBody =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
      `<soap:Body>` +
        `<${operacao}Request xmlns="http://nfse.abrasf.org.br">` +
          `<nfseCabecMsg xmlns="">${escapeXml(montarCabecalho())}</nfseCabecMsg>` +
          `<nfseDadosMsg xmlns="">${escapeXml(envelopeXml)}</nfseDadosMsg>` +
        `</${operacao}Request>` +
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
        SOAPAction: `http://nfse.abrasf.org.br/${operacao}`,
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
    throw new Error(`WebISS recusou a operação (${operacao}): ${detalhes || '(sem detalhes)'}\n\n--- XML COMPLETO DA RESPOSTA ---\n${outputXml}`);
  }

  return outputXml;
}

export async function enviarGerarNfse(envelopeXml, ambiente = 'homologacao') {
  return enviarOperacaoWebiss('GerarNfse', envelopeXml, ambiente);
}

// Extrai os dados principais de uma resposta de sucesso do GerarNfse
// (a primeira ocorrência de cada tag é sempre a do <InfNfse> raiz, antes de
// qualquer eco aninhado de dados enviados na requisição original).
export function parseNfseResposta(xml) {
  return {
    numero: xml.match(/<Numero>([\s\S]*?)<\/Numero>/)?.[1],
    codigoVerificacao: xml.match(/<CodigoVerificacao>([\s\S]*?)<\/CodigoVerificacao>/)?.[1],
    chaveAcesso: xml.match(/<ChaveAcesso>([\s\S]*?)<\/ChaveAcesso>/)?.[1],
    dataEmissao: xml.match(/<DataEmissao>([\s\S]*?)<\/DataEmissao>/)?.[1],
  };
}

// ─── Consultas de NFS-e já emitidas ─────────────────────────────────────────
//
// Identificação do Prestador (CARSANT) usada em todas as consultas — o
// código de município não entra aqui (só é relevante na emissão em si).
function prestadorIdentificacaoXml() {
  return `<Prestador>` +
    `<CpfCnpj><Cnpj>${CARSANT.cnpj}</Cnpj></CpfCnpj>` +
    `<InscricaoMunicipal>${CARSANT.inscricaoMunicipal}</InscricaoMunicipal>` +
  `</Prestador>`;
}

// filtros = { numeroNfse, periodoEmissao: {inicial, final}, periodoCompetencia:
// {inicial, final}, tomadorCnpj, pagina } — datas em "AAAA-MM-DD".
export function montarConsultarNfseServicoPrestadoEnvio(filtros = {}) {
  const periodoXml = filtros.periodoEmissao
    ? `<PeriodoEmissao><DataInicial>${filtros.periodoEmissao.inicial}</DataInicial><DataFinal>${filtros.periodoEmissao.final}</DataFinal></PeriodoEmissao>`
    : filtros.periodoCompetencia
      ? `<PeriodoCompetencia><DataInicial>${filtros.periodoCompetencia.inicial}</DataInicial><DataFinal>${filtros.periodoCompetencia.final}</DataFinal></PeriodoCompetencia>`
      : '';
  const tomadorXml = filtros.tomadorCnpj ? `<Tomador><CpfCnpj><Cnpj>${filtros.tomadorCnpj}</Cnpj></CpfCnpj></Tomador>` : '';

  return `<ConsultarNfseServicoPrestadoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">` +
    prestadorIdentificacaoXml() +
    (filtros.numeroNfse ? `<NumeroNfse>${filtros.numeroNfse}</NumeroNfse>` : '') +
    periodoXml +
    tomadorXml +
    `<Pagina>${filtros.pagina || 1}</Pagina>` +
  `</ConsultarNfseServicoPrestadoEnvio>`;
}

export async function consultarNfseServicoPrestado(filtros, ambiente = 'homologacao') {
  const envelope = montarConsultarNfseServicoPrestadoEnvio(filtros);
  return enviarOperacaoWebiss('ConsultarNfseServicoPrestado', envelope, ambiente);
}

// filtros = { numeroInicial, numeroFinal (opcional), pagina } — usado tanto
// para listar um intervalo quanto para descobrir o número da última nota
// emitida (numeroInicial=1, sem numeroFinal, olhando a última página).
export function montarConsultarNfsePorFaixaEnvio(filtros) {
  return `<ConsultarNfseFaixaEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">` +
    prestadorIdentificacaoXml() +
    `<Faixa>` +
      `<NumeroNfseInicial>${filtros.numeroInicial}</NumeroNfseInicial>` +
      (filtros.numeroFinal ? `<NumeroNfseFinal>${filtros.numeroFinal}</NumeroNfseFinal>` : '') +
    `</Faixa>` +
    `<Pagina>${filtros.pagina || 1}</Pagina>` +
  `</ConsultarNfseFaixaEnvio>`;
}

export async function consultarNfsePorFaixa(filtros, ambiente = 'homologacao') {
  const envelope = montarConsultarNfsePorFaixaEnvio(filtros);
  return enviarOperacaoWebiss('ConsultarNfsePorFaixa', envelope, ambiente);
}
