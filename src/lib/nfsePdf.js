// src/lib/nfsePdf.js
// Comprovante em PDF de uma NFS-e emitida — NÃO é o DANFSE oficial da
// Prefeitura (aquele exige captcha na página pública de validação do
// WebISS, confirmado via curl em 27/07/2026 — não automatizável). É um
// documento próprio do sistema, com os mesmos dados essenciais, mais
// uma nota de rodapé explicando como validar o oficial.
//
// Usa html2pdf.bundle.min.js carregado sob demanda via CDN — mesma
// técnica já usada em RelatorioInadimplencia.jsx, não é dependência do
// bundle.

async function carregarHtml2Pdf() {
  if (!window.html2pdf) {
    await import('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js')
  }
  return window.html2pdf
}

// cliente.nome e nota.discriminacao são texto livre editável por
// qualquer colaborador (não só gestor) — sem isso, um "onerror=..." num
// nome de cliente ou numa discriminação de serviço executaria quando
// QUALQUER OUTRO colaborador abrisse esse comprovante depois (o HTML
// monta um <img>/<svg> malicioso e injeta via innerHTML em
// comContainerTemporario abaixo).
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtValor(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d) {
  if (!d) return '—'
  return new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR')
}

function montarHtmlComprovante(nota, cliente) {
  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; color:#1f2937; max-width: 700px;">
      <h2 style="margin-bottom:4px;">Comprovante de Nota Fiscal de Serviço Eletrônica</h2>
      <p style="color:#6b7280; font-size:12px; margin-top:0;">Documento gerado pelo sistema da CARSANT Contabilidade — não substitui o DANFSE oficial da Prefeitura.</p>
      <table style="width:100%; border-collapse: collapse; font-size:13px; margin-top:16px;">
        <tr><td style="padding:6px 0; color:#6b7280; width:40%;">Prestador</td><td style="padding:6px 0; font-weight:bold;">CARSANT Contabilidade LTDA</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Tomador</td><td style="padding:6px 0; font-weight:bold;">${escapeHtml(cliente?.nome) || '—'}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">CNPJ do tomador</td><td style="padding:6px 0;">${escapeHtml(cliente?.cnpj) || '—'}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Número da NFS-e</td><td style="padding:6px 0; font-weight:bold;">${escapeHtml(nota.numero_nfse) || '—'}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Código de verificação</td><td style="padding:6px 0;">${escapeHtml(nota.codigo_verificacao) || '—'}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Chave de acesso</td><td style="padding:6px 0;">${escapeHtml(nota.chave_acesso) || '—'}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Competência</td><td style="padding:6px 0;">${fmtData(nota.competencia)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Valor dos serviços</td><td style="padding:6px 0; font-weight:bold;">${fmtValor(nota.valor_servicos)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280; vertical-align:top;">Discriminação</td><td style="padding:6px 0;">${escapeHtml(nota.discriminacao) || '—'}</td></tr>
      </table>
      <p style="font-size:11px; color:#9ca3af; margin-top:24px;">
        Para validar o documento oficial (DANFSe), acesse o Emissor Nacional (nfse.gov.br) e consulte pela chave de acesso acima. Notas antigas do WebISS usam o código de verificação.
      </p>
    </div>
  `
}

// html2canvas (usado internamente pelo html2pdf) gera captura em branco
// quando o elemento capturado tem position:fixed/absolute diretamente nele
// — confirmado testando várias variações. Por isso o container em si fica
// em fluxo normal (sem position própria) e quem "esconde" da tela é um
// wrapper externo com overflow:hidden + tamanho zero, que não afeta a
// captura.
async function comContainerTemporario(html, callback) {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'absolute'
  wrapper.style.left = '0'
  wrapper.style.top = '0'
  wrapper.style.width = '0'
  wrapper.style.height = '0'
  wrapper.style.overflow = 'hidden'
  const container = document.createElement('div')
  container.innerHTML = html
  wrapper.appendChild(container)
  document.body.appendChild(wrapper)
  try {
    return await callback(container)
  } finally {
    document.body.removeChild(wrapper)
  }
}

// ─── DANFSe próprio (notas do Emissor Nacional) ─────────────────────────────
// A API de DANFSe do portal nacional foi descontinuada (retorna 503) — a
// NT 008/2026 manda o emissor gerar o DANFSe a partir do XML da nota. Monta
// o documento (layout DANFSe v2.0) com o XML gravado em
// notas_fiscais.xml_resposta.

export function ehNotaNacionalComXml(nota) {
  return String(nota?.chave_acesso || '').replace(/\D/g, '').length === 50 && !!nota?.xml_resposta
}

const MUNICIPIOS = { 2910800: 'Feira de Santana', 2927408: 'Salvador', 2919207: 'Lauro de Freitas', 2905701: 'Camaçari', 3550308: 'São Paulo', 3304557: 'Rio de Janeiro', 3106200: 'Belo Horizonte' }

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
  const cMunToma = txt(end, 'cMun')
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
      endereco: [txt(emit, 'xLgr'), txt(emit, 'nro'), txt(emit, 'xCpl'), txt(emit, 'xBairro')].filter(Boolean).join(', '),
      cMun: txt(emit, 'cMun'), uf: txt(emit, 'UF'), cep: txt(emit, 'CEP'),
      municipio: txt(inf, 'xLocEmi'),
    },
    tomador: {
      nome: txt(toma, 'xNome'), doc: txt(toma, 'CNPJ') || txt(toma, 'CPF'), fone: txt(toma, 'fone'), email: txt(toma, 'email'),
      endereco: [txt(end, 'xLgr'), txt(end, 'nro'), txt(end, 'xCpl'), txt(end, 'xBairro')].filter(Boolean).map((s) => s.replace(/\s+/g, ' ')).join(', '),
      cMun: cMunToma, cep: txt(end, 'CEP'),
      municipio: MUNICIPIOS[cMunToma] || '',
    },
  }
}

function fmtDocumento(d) {
  const n = String(d || '').replace(/\D/g, '')
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d || '-'
}

function fmtTelefone(t) {
  const n = String(t || '').replace(/\D/g, '')
  if (n.length === 11) return n.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  if (n.length === 10) return n.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
  return t || '-'
}

function fmtCep(c) {
  const n = String(c || '').replace(/\D/g, '')
  return n.length === 8 ? n.replace(/^(\d{5})(\d{3})$/, '$1-$2') : c || '-'
}

function fmtIbge(c) {
  const n = String(c || '').replace(/\D/g, '')
  return n.length === 7 ? `${n.slice(0, 2)}.${n.slice(2)}` : c || '-'
}

function fmtDataHora(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(',', '')
}

function fmtDataIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '-'
}

function fmtCTribNac(c) {
  const n = String(c || '').replace(/\D/g, '')
  return n.length === 6 ? `${n.slice(0, 2)}.${n.slice(2, 4)}.${n.slice(4)}` : c || '-'
}

function fmtNbs(c) {
  const n = String(c || '').replace(/\D/g, '')
  return n.length === 9 ? `${n[0]}.${n.slice(1, 5)}.${n.slice(5, 7)}.${n.slice(7)}` : c || '-'
}

async function qrCodeDataUrl(texto) {
  try {
    if (!window.qrcode) {
      await new Promise((ok, falha) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
        s.onload = ok
        s.onerror = falha
        document.head.appendChild(s)
      })
    }
    const qr = window.qrcode(0, 'M')
    qr.addData(texto)
    qr.make()
    return qr.createDataURL(4, 0)
  } catch {
    return null
  }
}

async function montarHtmlDanfse(nota) {
  const d = dadosDoXml(nota.xml_resposta)
  if (!d) return null
  const chave = String(nota.chave_acesso).replace(/\D/g, '')
  const qr = await qrCodeDataUrl(`https://www.nfse.gov.br/consultapublica/?tpc=1&chave=${chave}`)
  const e = escapeHtml
  const vazio = (v) => (v === undefined || v === null || String(v).trim() === '' ? '-' : e(v))
  const dinheiro = (v) => (v ? fmtValor(v) : '-')

  // Linha de uma "tabela de células": cada célula = [rótulo, valor, largura%].
  const TD = 'border:0; padding:2px 4px; vertical-align:top;'
  const celula = ([rotulo, valor, largura, destaque]) =>
    `<td style="${TD} width:${largura}%;${destaque ? ' background:#f3f4f6;' : ''}"><div style="font-size:7.5px; font-weight:bold;">${e(rotulo)}</div><div style="font-size:9px;">${valor}</div></td>`
  const linha = (celulas) => `<tr>${celulas.map(celula).join('')}</tr>`
  const secao = (titulo, sub, linhas) =>
    `<table style="width:100%; border-collapse:collapse; border-top:1px solid #000;">
       <tr><td style="${TD} width:25%; background:#f3f4f6; font-size:9px; font-weight:bold; vertical-align:middle;" rowspan="2">${e(titulo)}</td>
       ${sub.map(celula).join('')}</tr>
     </table>
     <table style="width:100%; border-collapse:collapse; table-layout:fixed;">${linhas.map(linha).join('')}</table>`
  const faixa = (texto) => `<div style="border-top:1px solid #000; text-align:center; font-size:8.5px; padding:1px 0;">${e(texto)}</div>`

  const regime = d.opSimpNac === '3' ? 'Optante - Microempresa ou Empresa de Pequeno Porte' : d.opSimpNac === '2' ? 'Optante - Microempreendedor Individual (MEI)' : 'Não Optante'
  const tributacao = d.tribISSQN === '1' ? 'Operação Tributável' : d.tribISSQN === '2' ? 'Imunidade' : d.tribISSQN === '3' ? 'Exportação de Serviço' : d.tribISSQN === '4' ? 'Não Incidência' : '-'
  const retencao = d.tpRetISSQN === '1' ? 'Não Retido' : d.tpRetISSQN ? 'Retido' : '-'
  const situacao = d.cStat === '100' ? 'NFS-e Gerada' : '-'
  const municipioPrestador = d.prestador.municipio || MUNICIPIOS[d.prestador.cMun] || ''
  const municipioTomador = d.tomador.municipio || d.tomador.cMun
  const UF_POR_PREFIXO = { 29: 'BA', 35: 'SP', 33: 'RJ', 31: 'MG', 28: 'SE', 26: 'PE', 23: 'CE', 53: 'DF', 41: 'PR', 42: 'SC', 43: 'RS', 52: 'GO' }
  const ufTomador = UF_POR_PREFIXO[String(d.tomador.cMun).slice(0, 2)] ? ` / ${UF_POR_PREFIXO[String(d.tomador.cMun).slice(0, 2)]}` : ''
  const t = d.tomador
  const p = d.prestador

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color:#000; width:690px; min-height:1000px; display:flex; flex-direction:column; border:1px solid #000; box-sizing:border-box;">
      <table style="width:100%; border-collapse:collapse;"><tr>
        <td style="${TD} width:30%; vertical-align:middle;"><span style="font-size:26px; font-weight:bold; color:#0b6fb8;">NFS</span><span style="font-size:26px; font-weight:bold; color:#16a34a;">e</span><br/><span style="font-size:8px; color:#374151;">Nota Fiscal de Serviço eletrônica</span></td>
        <td style="${TD} width:40%; text-align:center; vertical-align:middle; font-weight:bold; font-size:12px;">DANFSe v2.0<br/>Documento Auxiliar da NFS-e</td>
        <td style="${TD} width:30%; text-align:right; vertical-align:middle; font-size:10px;">Município: ${e(municipioPrestador || '-')} - ${e(p.uf || '')}<br/><span style="font-size:8px;">Ambiente Gerador: ${e(d.ambGer || '-')}<br/>Tipo de Ambiente: ${e(d.tpAmb || '-')}</span></td>
      </tr></table>
      <table style="width:100%; border-collapse:collapse; border-top:1px solid #000;"><tr>
        <td style="${TD} vertical-align:top;">
          <div style="font-size:7.5px; font-weight:bold;">CHAVE DE ACESSO DA NFS-e</div><div style="font-size:9px; margin-bottom:6px;">${e(chave)}</div>
          <table style="width:100%; border-collapse:collapse;">
            ${linha([['NÚMERO DA NFS-e', vazio(d.numero), 33], ['COMPETÊNCIA DA NFS-e', fmtDataIso(d.competencia), 33], ['DATA E HORA DA EMISSÃO DA NFS-e', fmtDataHora(d.processamento), 34]])}
            ${linha([['NÚMERO DA DPS', vazio(d.nDps), 33], ['SÉRIE DA DPS', vazio(d.serie), 33], ['DATA E HORA DA EMISSÃO DA DPS', fmtDataHora(d.dhEmiDps), 34]])}
          </table>
        </td>
        <td style="${TD} width:150px; text-align:center; vertical-align:middle;">${qr ? `<img src="${qr}" style="width:100px; height:100px;" />` : ''}<div style="font-size:7px;">A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e</div></td>
      </tr></table>
      <table style="width:100%; border-collapse:collapse; border-top:1px solid #000;">${linha([['EMITENTE DA NFS-e', 'Prestador', 33, true], ['SITUAÇÃO DA NFS-e', situacao, 33], ['FINALIDADE', '-', 34]])}</table>
      ${secao('PRESTADOR / FORNECEDOR', [['CNPJ / CPF / NIF', e(fmtDocumento(p.doc)), 25], ['Indicador Municipal (Inscrição)', '-', 25], ['Telefone', e(fmtTelefone(p.fone)), 25]], [
        [['Nome / Nome Empresarial', e(p.nome), 50], ['Município / Sigla UF', `${e(municipioPrestador || '-')} / ${e(p.uf || '-')}`, 25], ['Código IBGE / CEP', `${fmtIbge(p.cMun)} / ${fmtCep(p.cep)}`, 25]],
        [['Endereço', e(p.endereco), 50], ['E-mail', e(p.email || '-'), 50]],
        [['Simples Nacional na Data de Competência', e(regime), 42], ['Regime de Apuração Tributária pelo SN', 'Regime de apuração dos tributos federais e municipal pelo Simples Nacional', 58]],
      ])}
      ${secao('TOMADOR / ADQUIRENTE', [['CNPJ / CPF / NIF', e(fmtDocumento(t.doc)), 25], ['Indicador Municipal (Inscrição)', '-', 25], ['Telefone', e(fmtTelefone(t.fone)), 25]], [
        [['Nome / Nome Empresarial', e(t.nome || '-'), 50], ['Município / Sigla UF', `${e(municipioTomador || '-')}${ufTomador}`, 25], ['Código IBGE / CEP', `${fmtIbge(t.cMun)} / ${fmtCep(t.cep)}`, 25]],
        [['Endereço', e(t.endereco), 50], ['E-mail', e(t.email || '-'), 50]],
      ])}
      ${faixa('DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e')}
      ${faixa('INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e')}
      ${secao('SERVIÇO PRESTADO', [['Código de Tributação Nacional/Municipal', `${e(fmtCTribNac(d.cTribNac))} / -`, 25], ['Código da NBS', e(fmtNbs(d.cNBS)), 25], ['Local da Prestação / Sigla UF / País', `${e(d.xLocPrestacao || '-')} / ${e(p.uf || '-')} / -`, 25]], [
        [['', e(d.xTribNac), 100]],
        [['Descrição do Serviço', e(d.descricao || nota.discriminacao), 100]],
      ])}
      ${secao('TRIBUTAÇÃO MUNICIPAL (ISSQN)', [['Tipo de Tributação do ISSQN', e(tributacao), 25], ['Município / Sigla UF / País de Incidência do ISSQN', `${e(d.xLocIncid || '-')} / ${e(p.uf || '-')} / -`, 50]], [
        [['BC ISSQN', '-', 25], ['Alíquota Aplicada', '-', 25], ['Retenção do ISSQN', e(retencao), 25], ['ISSQN Apurado', '-', 25]],
      ])}
      ${secao('TRIBUTAÇÃO FEDERAL (EXCETO CBS)', [['IRRF', '-', 25], ['Contribuição Previdenciária - Retida', '-', 25], ['Contribuições Sociais - Retidas', '-', 25]], [
        [['PIS - Débito Apuração Própria', '-', 25], ['COFINS - Débito Apuração Própria', '-', 25], ['Descrição Contrib. Sociais - Retidas', '-', 50]],
      ])}
      ${secao('TRIBUTAÇÃO IBS/CBS', [['CST / cClassTrib', '- / -', 25], ['Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', '- / - / - / -', 50]], [
        [['Exclusões e Reduções da Base de Cálculo', 'R$ 0,00', 25], ['Base de Cálculo Após Exclusões e Reduções', '-', 25], ['Red. Alíquota IBS / Red. Alíquota CBS', '- / -', 25], ['Alíquota - IBS UF / IBS Mun', '- / -', 25]],
        [['Valor Total Apurado - IBS', '-', 25], ['Alíquota - CBS', '-', 25], ['Alíquota Efetiva - CBS', '-', 25], ['Valor Total Apurado - CBS', '-', 25]],
      ])}
      ${secao('VALOR TOTAL DA NFS-e', [['VALOR DA OPERAÇÃO / SERVIÇO', e(dinheiro(d.valor)), 25], ['Desconto Incondicionado', '-', 25], ['Desconto Condicionado', '-', 25]], [
        [['Total das Retenções (ISSQN / Federais)', '-', 25], ['VALOR LÍQUIDO DA NFS-e', e(dinheiro(d.liquido || d.valor)), 25, true], ['Total do IBS/CBS', 'R$ 0,00', 25], ['VALOR LÍQUIDO DA NFS-e + IBS/CBS', e(dinheiro(d.liquido || d.valor)), 25, true]],
      ])}
      <div style="border-top:1px solid #000; padding:3px 4px; font-size:8.5px; font-weight:bold;">INFORMAÇÕES COMPLEMENTARES</div>
      <div style="padding:3px 4px 6px; font-size:9px; flex:1;">Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: -; Estaduais: -; Municipais: -;</div>
      <table style="width:100%; border-collapse:collapse; border:1px solid #000; margin:6px; width:calc(100% - 12px); table-layout:fixed;"><tr>
        <td style="${TD} width:25%; border-right:1px solid #000; font-size:8px; font-weight:bold;">DATA CIENTIFICAÇÃO:<br/><br/></td>
        <td style="${TD} width:30%; border-right:1px solid #000; font-size:8px; font-weight:bold;">IDENTIFICAÇÃO E ASSINATURA</td>
        <td style="${TD} font-size:8px;"><b>N° NFS-e / CHAVE NFS-e</b><br/>${e(d.numero)} / ${e(chave)}</td>
      </tr></table>
    </div>`
}

async function montarHtmlDoPdf(nota, cliente) {
  if (ehNotaNacionalComXml(nota)) {
    const danfse = await montarHtmlDanfse(nota).catch(() => null)
    if (danfse) return danfse
  }
  return montarHtmlComprovante(nota, cliente)
}

export async function baixarComprovantePdf(nota, cliente) {
  const html2pdf = await carregarHtml2Pdf()
  const html = await montarHtmlDoPdf(nota, cliente)
  await comContainerTemporario(html, (container) =>
    html2pdf()
      .set({ margin: 10, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, filename: `NFSe-${nota.numero_nfse || nota.id}.pdf` })
      .from(container)
      .save()
  )
}

export async function gerarComprovantePdfBase64(nota, cliente) {
  const html2pdf = await carregarHtml2Pdf()
  const html = await montarHtmlDoPdf(nota, cliente)
  return comContainerTemporario(html, async (container) => {
    const dataUri = await html2pdf()
      .set({ margin: 10, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } })
      .from(container)
      .outputPdf('datauristring')
    return dataUri.split(',')[1]
  })
}

// Uint8Array/texto -> base64 em pedaços, pra não estourar o limite de
// argumentos do String.fromCharCode(...) com arquivos grandes.
export function textoParaBase64Utf8(texto) {
  const bytes = new TextEncoder().encode(texto)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
