// Integração NFS-e - WebISS Feira de Santana (padrão ABRASF v2.01)
// Gera e assina a DPS (Declaração de Prestação de Serviço) para emissão de NFS-e.
//
// Segue o mesmo padrão de mTLS/certificado por variável de ambiente usado em
// api/inter-cobranca.js. Antes de usar em produção, preencher os TODOs abaixo
// com os dados cadastrais da CARSANT e a URL do Web Service de homologação/produção.

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

// Endpoints do WebISS Feira de Santana (plataforma IBAM/ABRASF).
// TODO: confirmar URL exata assim que o acesso ao Web Service de Homologação
// for liberado por callcenter2@webiss.com.br ou pelo portal (Downloads e Manuais).
const WEBISS_URLS = {
  homologacao: process.env.WEBISS_HOMOLOGACAO_URL || 'TODO_URL_HOMOLOGACAO',
  producao: process.env.WEBISS_PRODUCAO_URL || 'TODO_URL_PRODUCAO',
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
  // tsCompetencia é dateTime (AAAA-MM-DDTHH:mm:ss) no schema v2.01
  return date.toISOString().replace(/\.\d{3}Z$/, '');
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
    `<Competencia>${formatarCompetencia(dados.competencia || new Date())}</Competencia>` +
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
export function montarDpsAssinada(dados, credenciais) {
  const infXml = montarInfDeclaracaoDps(dados);
  const idTag = `dps_${CARSANT.cnpj}_${dados.rpsSerie || 1}_${dados.rpsNumero}`;
  const dpsAssinada = assinarInfDeclaracao(infXml, idTag, credenciais);
  return montarGerarNfseEnvio(dpsAssinada);
}

// ─── Transporte SOAP (TODO: completar quando a URL de homologação for confirmada) ──
//
// O Web Service WebISS espera o XML como string dentro de um wrapper SOAP,
// no formato: <nfseCabecMsg>...</nfseCabecMsg><nfseDadosMsg>...</nfseDadosMsg>
// (ver wsdl_nfse_v2.zip / nfse.wsdl). Esta função ainda não está ativa.
export async function enviarGerarNfse(_envelopeXml, _ambiente = 'homologacao') {
  throw new Error(
    'Endpoint do Web Service ainda não configurado. Preencher WEBISS_HOMOLOGACAO_URL ' +
    'assim que o link de acesso ao ambiente de homologação for obtido junto ao WebISS.'
  );
}
