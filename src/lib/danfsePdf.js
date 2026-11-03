// src/lib/danfsePdf.js
// DANFSe v2.0 das notas do Emissor Nacional, desenhado ponto a ponto no
// mesmo leiaute do PDF oficial do portal (A4 em pontos; medidas, fontes e
// cores extraídas de um DANFSe real). A API de DANFSe do portal foi
// descontinuada (NT 008/2026): o emissor gera o PDF a partir do XML da nota
// (notas_fiscais.xml_resposta).
import logoUrl from '../assets/nfse-logo.png'

export function ehNotaNacionalComXml(nota) {
  return String(nota?.chave_acesso || '').replace(/\D/g, '').length === 50 && !!nota?.xml_resposta
}

const MUNICIPIOS = { 2910800: ['Feira de Santana', 'BA'], 2927408: ['Salvador', 'BA'], 2919207: ['Lauro de Freitas', 'BA'], 2905701: ['Camaçari', 'BA'] }

async function carregarScript(src, global) {
  if (window[global]) return window[global]
  await new Promise((ok, falha) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = ok
    s.onerror = falha
    document.head.appendChild(s)
  })
  return window[global]
}

async function imagemComoDataUrl(url) {
  const blob = await (await fetch(url)).blob()
  return new Promise((ok) => {
    const r = new FileReader()
    r.onload = () => ok(r.result)
    r.readAsDataURL(blob)
  })
}

function dadosDoXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return null
  const filho = (pai, nome) => (pai ? pai.getElementsByTagNameNS('*', nome)[0] || null : null)
  const txt = (pai, nome) => (filho(pai, nome)?.textContent || '').trim()
  const inf = filho(doc, 'infNFSe')
  const dps = filho(inf, 'infDPS')
  if (!inf || !dps) return null
  const emit = filho(inf, 'emit')
  const prest = filho(dps, 'prest')
  const toma = filho(dps, 'toma')
  const end = filho(toma, 'end')
  const endereco = (pai, campos) => campos.map((c) => txt(pai, c).replace(/\s+/g, ' ')).filter(Boolean).join(', ')
  return {
    numero: txt(inf, 'nNFSe'),
    processamento: txt(inf, 'dhProc'),
    ambGer: txt(inf, 'ambGer'),
    tpAmb: txt(dps, 'tpAmb'),
    cStat: txt(inf, 'cStat'),
    serie: txt(dps, 'serie'),
    nDps: txt(dps, 'nDPS'),
    dhEmiDps: txt(dps, 'dhEmi'),
    competencia: txt(dps, 'dCompet'),
    xLocEmi: txt(inf, 'xLocEmi'),
    xLocPrestacao: txt(inf, 'xLocPrestacao'),
    xLocIncid: txt(inf, 'xLocIncid'),
    xTribNac: txt(inf, 'xTribNac'),
    cTribNac: txt(dps, 'cTribNac'),
    cNBS: txt(dps, 'cNBS'),
    descricao: txt(dps, 'xDescServ'),
    tribISSQN: txt(dps, 'tribISSQN'),
    tpRetISSQN: txt(dps, 'tpRetISSQN'),
    opSimpNac: txt(prest, 'opSimpNac'),
    valor: txt(dps, 'vServ'),
    liquido: txt(inf, 'vLiq'),
    prestador: {
      nome: txt(emit, 'xNome'), doc: txt(emit, 'CNPJ') || txt(emit, 'CPF'), fone: txt(emit, 'fone'), email: txt(emit, 'email'),
      endereco: endereco(emit, ['xLgr', 'nro', 'xCpl', 'xBairro']),
      cMun: txt(emit, 'cMun'), uf: txt(emit, 'UF'), cep: txt(emit, 'CEP'),
    },
    tomador: {
      nome: txt(toma, 'xNome'), doc: txt(toma, 'CNPJ') || txt(toma, 'CPF'), fone: txt(toma, 'fone'), email: txt(toma, 'email'),
      endereco: endereco(toma, ['xLgr', 'nro', 'xCpl', 'xBairro']),
      cMun: txt(end, 'cMun'), cep: txt(end, 'CEP'),
    },
  }
}

// Nome/UF do município do tomador: tabela local e, se faltar, a API pública
// de localidades do IBGE (só o código do município vai na consulta).
async function municipioPorCodigo(cMun) {
  if (!cMun) return ['-', '-']
  if (MUNICIPIOS[cMun]) return MUNICIPIOS[cMun]
  try {
    const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${cMun}`)
    const j = await r.json()
    const uf = j?.microrregiao?.mesorregiao?.UF?.sigla || j?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla
    if (j?.nome) return [j.nome, uf || '-']
  } catch { /* cai no código */ }
  return [String(cMun), '-']
}

const soDigitos = (v) => String(v || '').replace(/\D/g, '')
const fmtDoc = (v) => {
  const n = soDigitos(v)
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return v || '-'
}
const fmtFone = (v) => {
  const n = soDigitos(v)
  if (n.length === 11) return n.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  if (n.length === 10) return n.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
  return v || '-'
}
const fmtCep = (v) => {
  const n = soDigitos(v)
  return n.length === 8 ? n.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3') : v || '-'
}
const fmtIbge = (v) => {
  const n = soDigitos(v)
  return n.length === 7 ? `${n.slice(0, 2)}.${n.slice(2)}` : v || '-'
}
const fmtCTribNac = (v) => {
  const n = soDigitos(v)
  return n.length === 6 ? `${n.slice(0, 2)}.${n.slice(2, 4)}.${n.slice(4)}` : v || '-'
}
const fmtNbs = (v) => {
  const n = soDigitos(v)
  return n.length === 9 ? `${n[0]}.${n.slice(1, 5)}.${n.slice(5, 7)}.${n.slice(7)}` : v || '-'
}
const fmtDataIso = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-'
}
const fmtDataHora = (v) => {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }).replace(',', '')
}
const fmtMoeda = (v) => (v === '' || v === undefined || v === null ? '-' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const vazio = (v) => (v === undefined || v === null || String(v).trim() === '' ? '-' : String(v))

const CINZA = 242 // 0.949 * 255

export async function gerarDanfsePdf(nota) {
  const d = dadosDoXml(nota.xml_resposta)
  if (!d) return null
  const chave = soDigitos(nota.chave_acesso)
  const [{ jsPDF }, qrcode, logo, [munToma, ufToma]] = await Promise.all([
    carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf'),
    carregarScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', 'qrcode'),
    imagemComoDataUrl(logoUrl),
    municipioPorCodigo(d.tomador.cMun),
  ])
  const qr = qrcode(0, 'M')
  qr.addData(`https://www.nfse.gov.br/consultapublica/?tpc=1&chave=${chave}`)
  qr.make()

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const S = 0.905 // ascendente: converte o topo da caixa de texto na linha de base
  const texto = (str, x, y0, tam, negrito, opcoes = {}) => {
    pdf.setFont('helvetica', negrito ? 'bold' : 'normal')
    pdf.setFontSize(tam)
    pdf.text(String(str), x, y0 + S * tam, opcoes)
  }
  const rotulo = (str, x, y0, tam = 6) => texto(str, x, y0, tam, true)
  const valor = (str, x, y0) => texto(str, x, y0, 7, false)
  const celula = (r, v, x, y0) => { rotulo(r, x, y0); valor(v, x, y0 + 6.7) }
  const linha = (x1, y1, x2, y2, w) => { pdf.setLineWidth(w); pdf.setDrawColor(0); pdf.line(x1, y1, x2, y2) }
  const fundo = (x1, y1, x2, y2) => { pdf.setFillColor(CINZA); pdf.rect(x1, y1, x2 - x1, y2 - y1, 'F') }
  const cortar = (str, largura) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
    if (pdf.getTextWidth(str) <= largura) return str
    let s = str
    while (s.length > 1 && pdf.getTextWidth(`${s} ...`) > largura) s = s.slice(0, -1)
    return `${s} ...`
  }
  const X1 = 11.9, X2 = 156.5, X3 = 301.0, X4 = 445.6

  // Descrição longa empurra as seções abaixo (o portal cresce a caixa).
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
  const linhasDescricao = pdf.splitTextToSize(vazio(d.descricao || nota.discriminacao), 570)
  const dy = Math.max(0, linhasDescricao.length - 1) * 7.9
  const Y = (y) => (y >= 336.5 ? y + dy : y)

  // Fundos cinza
  const cinzas = [[8.5, 5.7, 153.1, 39.7], [153.1, 5.7, 442.2, 39.7], [442.2, 5.7, 586.8, 39.7], [8.5, 105.1, 153.1, 125.3], [8.5, 125.8, 153.1, 144.9], [8.5, 203.7, 153.1, 222.7], [8.5, 286.1, 153.1, 305.2], [8.5, 337.0, 153.1, 356.0], [8.5, 375.6, 153.1, 394.7], [8.5, 414.3, 153.1, 433.3], [8.5, 491.1, 153.1, 510.1], [442.2, 510.1, 586.8, 529.2]]
  cinzas.forEach(([a, b, c, e]) => fundo(a, Y(b), c, Y(e)))

  // Linhas
  pdf.setLineWidth(1); pdf.setDrawColor(0); pdf.rect(5, 5, 585, 832)
  ;[[8.5, 442.2, 39.9], [442.2, 586.8, 39.9]].forEach(([a, b, y]) => linha(a, y, b, y, 0.5))
  ;[125.6, 203.4, 285.9, 336.7, 375.4, 414.0, 490.8].forEach((y) => {
    const yy = Y(y)
    if (y === 336.7 || y === 285.9) {
      linha(8.5, yy, 153.1, yy, 0.5); linha(153.1, yy, 297.6, yy, 0.5)
      linha(297.6, yy, y === 336.7 ? 586.8 : 442.2, yy, 0.5)
      if (y === 285.9) linha(442.2, yy, 586.8, yy, 0.5)
    } else {
      linha(8.5, yy, 586.8, yy, 0.5)
    }
  })
  linha(8.5, 269.0, 586.8, 269.0, 0.5); linha(8.5, 277.5, 586.8, 277.5, 0.5); linha(8.5, Y(529.5), 586.8, Y(529.5), 0.5)
  ;[[8.5, 154.1], [153.1, 298.6], [297.6, 587.8]].forEach(([a, b]) => { linha(a, 795.8, b, 795.8, 1); linha(a, 815.9, b, 815.9, 1) })
  ;[9.0, 153.6, 298.1, 587.3].forEach((x) => linha(x, 796.3, x, 816.4, 1))

  // Cabeçalho
  pdf.addImage(logo, 'PNG', 11.9, 10.3, 115.7, 22.9)
  texto('DANFSe v2.0', 297.65, 12.6, 9, true, { align: 'center' })
  texto('Documento Auxiliar da NFS-e', 297.65, 23.0, 9, true, { align: 'center' })
  texto(`Município: ${vazio(d.xLocEmi)} - ${vazio(d.prestador.uf)}`, X4, 11.4, 8, false)
  texto(`Ambiente Gerador: ${vazio(d.ambGer)}`, X4, 20.4, 6, false)
  texto(`Tipo de Ambiente: ${vazio(d.tpAmb)}`, X4, 27.2, 6, false)

  rotulo('CHAVE DE ACESSO DA NFS-e', X1, 44.7, 7)
  valor(chave, X1, 52.5)
  const n = qr.getModuleCount(), mod = 45 / n
  pdf.setFillColor(0)
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) pdf.rect(492.0 + col * mod, 44.8 + r * mod, mod + 0.15, mod + 0.15, 'F')
  ;['A autenticidade desta NFS-e pode ser verificada', 'pela leitura deste código QR ou pela consulta da', 'chave de acesso no portal nacional da NFS-e'].forEach((l, i) => texto(l, X4, 91.9 + i * 6.8, 6, false))

  const topo = (r, v, x, y0) => { rotulo(r, x, y0, 7); valor(v, x, y0 + 7.8) }
  topo('NÚMERO DA NFS-e', vazio(d.numero), X1, 64.9)
  topo('COMPETÊNCIA DA NFS-e', fmtDataIso(d.competencia), X2, 64.9)
  topo('DATA E HORA DA EMISSÃO DA NFS-e', fmtDataHora(d.processamento), X3, 64.9)
  topo('NÚMERO DA DPS', vazio(d.nDps), X1, 85.1)
  topo('SÉRIE DA DPS', vazio(d.serie), X2, 85.1)
  topo('DATA E HORA DA EMISSÃO DA DPS', fmtDataHora(d.dhEmiDps), X3, 85.1)
  topo('EMITENTE DA NFS-e', 'Prestador', X1, 105.3)
  topo('SITUAÇÃO DA NFS-e', d.cStat === '100' ? 'NFS-e Gerada' : '-', X2, 105.3)
  topo('FINALIDADE', '-', X3, 105.3)

  const secao = (titulo, y0) => texto(titulo, X1, Y(y0), 7, true)
  const c = (r, v, x, y0) => celula(r, v, x, Y(y0))

  // Prestador
  const p = d.prestador
  secao('PRESTADOR / FORNECEDOR', 126.1)
  c('CNPJ / CPF / NIF', fmtDoc(p.doc), X2, 126.0)
  c('Indicador Municipal (Inscrição)', '-', X3, 126.0)
  c('Telefone', fmtFone(p.fone), X4, 126.0)
  c('Nome / Nome Empresarial', vazio(p.nome), X1, 145.1)
  c('Município / Sigla UF', `${vazio(d.xLocEmi)} / ${vazio(p.uf)}`, X3, 145.1)
  c('Código IBGE / CEP', `${fmtIbge(p.cMun)} / ${fmtCep(p.cep)}`, X4, 145.1)
  c('Endereço', vazio(p.endereco), X1, 164.2)
  c('E-mail', vazio(p.email), X3, 164.2)
  const regime = d.opSimpNac === '3' ? 'Optante - Microempresa ou Empresa de Pequeno Porte' : d.opSimpNac === '2' ? 'Optante - Microempreendedor Individual (MEI)' : 'Não Optante'
  c('Simples Nacional na Data de Competência', cortar(regime, 134), X1, 183.3)
  c('Regime de Apuração Tributária pelo SN', 'Regime de apuração dos tributos federais e municipal pelo Simples Nacional', X2, 184.1)

  // Tomador
  const t = d.tomador
  secao('TOMADOR / ADQUIRENTE', 203.9)
  c('CNPJ / CPF / NIF', fmtDoc(t.doc), X2, 203.9)
  c('Indicador Municipal (Inscrição)', '-', X3, 203.9)
  c('Telefone', fmtFone(t.fone), X4, 203.9)
  c('Nome / Nome Empresarial', vazio(t.nome), X1, 222.9)
  c('Município / Sigla UF', `${munToma} / ${ufToma}`, X3, 222.9)
  c('Código IBGE / CEP', `${fmtIbge(t.cMun)} / ${fmtCep(t.cep)}`, X4, 222.9)
  rotulo('Endereço', X1, 242.0)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7)
  pdf.splitTextToSize(vazio(t.endereco), 280).slice(0, 2).forEach((l, i) => valor(l, X1, 248.7 + i * 7.9))
  c('E-mail', vazio(t.email), X3, 242.0)

  texto('DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e', 297.65, 269.3, 7, false, { align: 'center' })
  texto('INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e', 297.65, 277.7, 7, false, { align: 'center' })

  // Serviço
  secao('SERVIÇO PRESTADO', 286.4)
  celula('Código de Tributação Nacional/Municipal', `${fmtCTribNac(d.cTribNac)} / -`, X2, 286.3)
  celula('Código da NBS', fmtNbs(d.cNBS), X3, 286.3)
  celula('Local da Prestação / Sigla UF / País', `${vazio(d.xLocPrestacao)} / ${vazio(p.uf)} / -`, X4, 286.3)
  valor(vazio(d.xTribNac), X1, 305.2)
  rotulo('Descrição do Serviço', X1, 317.6)
  linhasDescricao.forEach((l, i) => valor(l, X1, 324.3 + i * 7.9))

  // Tributação municipal
  secao('TRIBUTAÇÃO MUNICIPAL (ISSQN)', 337.2)
  const tributacao = { 1: 'Operação Tributável', 2: 'Imunidade', 3: 'Exportação de Serviço', 4: 'Não Incidência' }[d.tribISSQN] || '-'
  c('Tipo de Tributação do ISSQN', tributacao, X2, 337.2)
  c('Município / Sigla UF / País de Incidência do ISSQN', `${vazio(d.xLocIncid)} / ${vazio(p.uf)} / -`, X3, 337.2)
  c('BC ISSQN', '-', X1, 356.2)
  c('Alíquota Aplicada', '-', X2, 356.2)
  c('Retenção do ISSQN', d.tpRetISSQN === '1' ? 'Não Retido' : d.tpRetISSQN ? 'Retido' : '-', X3, 356.2)
  c('ISSQN Apurado', '-', X4, 356.2)

  // Tributação federal
  secao('TRIBUTAÇÃO FEDERAL (EXCETO CBS)', 375.8)
  c('IRRF', '-', X2, 375.8)
  c('Contribuição Previdenciária - Retida', '-', X3, 375.8)
  c('Contribuições Sociais - Retidas', '-', X4, 375.8)
  c('PIS - Débito Apuração Própria', '-', X1, 394.9)
  c('COFINS - Débito Apuração Própria', '-', X2, 394.9)
  c('Descrição Contrib. Sociais - Retidas', '-', X3, 394.9)

  // IBS/CBS
  secao('TRIBUTAÇÃO IBS/CBS', 414.5)
  c('CST / cClassTrib', '- / -', X2, 414.5)
  c('Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', '- / - / - / -', X3, 414.5)
  c('Exclusões e Reduções da Base de Cálculo', 'R$ 0,00', X1, 433.5)
  c('Base de Cálculo Após Exclusões e Reduções', '-', X2, 433.5)
  c('Red. Alíquota IBS / Red. Alíquota CBS', '- / - / -', X3, 433.5)
  c('Alíquota - IBS UF / IBS Mun', '- / -', X4, 433.5)
  c('Alíq. Efetiva Municipal - IBS', '-', X1, 452.6)
  c('Valor Apurado Municipal - IBS', '-', X2, 452.6)
  c('Alíq. Efetiva Estadual - IBS', '-', X3, 452.6)
  c('Valor Apurado Estadual - IBS', '-', X4, 452.6)
  c('Valor Total Apurado - IBS', '-', X1, 471.7)
  c('Alíquota - CBS', '-', X2, 471.7)
  c('Alíquota Efetiva - CBS', '-', X3, 471.7)
  c('Valor Total Apurado - CBS', '-', X4, 471.7)

  // Valores
  secao('VALOR TOTAL DA NFS-e', 491.3)
  c('VALOR DA OPERAÇÃO / SERVIÇO', fmtMoeda(d.valor), X2, 491.3)
  c('Desconto Incondicionado', '-', X3, 491.3)
  c('Desconto Condicionado', '-', X4, 491.3)
  c('Total das Retenções (ISSQN / Federais)', '-', X1, 510.3)
  c('VALOR LÍQUIDO DA NFS-e', fmtMoeda(d.liquido || d.valor), X2, 510.3)
  c('Total do IBS/CBS', 'R$ 0,00', X3, 510.3)
  c('VALOR LÍQUIDO DA NFS-e + IBS/CBS', 'R$ 0,00', X4, 510.3)

  secao('INFORMAÇÕES COMPLEMENTARES', 529.9)
  texto('Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: -; Estaduais: -; Municipais: -;', X1, Y(549.9), 7, false)

  // Rodapé
  rotulo('DATA CIENTIFICAÇÃO:', 12.9, 796.5)
  rotulo('IDENTIFICAÇÃO E ASSINATURA', 157.5, 796.5)
  rotulo('N° NFS-e / CHAVE NFS-e', 302.0, 796.5)
  valor(`${vazio(d.numero)} / ${chave}`, 302.0, 803.2)

  return pdf
}

export async function baixarDanfsePdf(nota) {
  const pdf = await gerarDanfsePdf(nota)
  if (!pdf) throw new Error('XML da nota inválido.')
  pdf.save(`NFSe-${nota.numero_nfse || nota.id}.pdf`)
}

export async function danfsePdfBase64(nota) {
  const pdf = await gerarDanfsePdf(nota)
  if (!pdf) throw new Error('XML da nota inválido.')
  return pdf.output('datauristring').split(',')[1]
}
