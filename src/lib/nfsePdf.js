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
// o documento com os campos do XML gravado em notas_fiscais.xml_resposta.

export function ehNotaNacionalComXml(nota) {
  return String(nota?.chave_acesso || '').replace(/\D/g, '').length === 50 && !!nota?.xml_resposta
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
  const toma = filho(dps, 'toma')
  const end = filho(toma, 'end')
  return {
    numero: txt(inf, 'nNFSe'),
    processamento: txt(inf, 'dhProc'),
    local: txt(inf, 'xLocPrestacao') || txt(inf, 'xLocEmi'),
    tribNac: txt(inf, 'xTribNac'),
    nbs: txt(inf, 'xNBS'),
    ambiente: txt(inf, 'ambGer'),
    prestador: {
      nome: txt(emit, 'xNome'), doc: txt(emit, 'CNPJ'), fone: txt(emit, 'fone'), email: txt(emit, 'email'),
      endereco: [txt(emit, 'xLgr'), txt(emit, 'nro'), txt(emit, 'xBairro'), txt(emit, 'UF'), txt(emit, 'CEP')].filter(Boolean).join(', '),
    },
    tomador: {
      nome: txt(toma, 'xNome'), doc: txt(toma, 'CNPJ') || txt(toma, 'CPF'), fone: txt(toma, 'fone'), email: txt(toma, 'email'),
      endereco: [txt(end, 'xLgr'), txt(end, 'nro'), txt(end, 'xCpl'), txt(end, 'xBairro'), txt(end, 'CEP')].filter(Boolean).map((s) => s.replace(/\s+/g, ' ')).join(', '),
    },
    competencia: txt(dps, 'dCompet'),
    descricao: txt(dps, 'xDescServ'),
    valor: txt(dps, 'vServ'),
    liquido: txt(inf, 'vLiq'),
    issRetido: txt(dps, 'tpRetISSQN') === '1' ? 'Não retido' : 'Retido',
    pTotTribSN: txt(dps, 'pTotTribSN'),
  }
}

function fmtDocumento(d) {
  const n = String(d || '').replace(/\D/g, '')
  if (n.length === 14) return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d || '—'
}

function fmtDataHora(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
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
  const linha = (rotulo, valor, negrito) =>
    `<tr><td style="padding:3px 8px 3px 0; color:#6b7280; width:28%; vertical-align:top;">${rotulo}</td><td style="padding:3px 0;${negrito ? ' font-weight:bold;' : ''}">${valor || '—'}</td></tr>`
  const bloco = (titulo, linhas) =>
    `<div style="border:1px solid #d1d5db; border-radius:4px; margin-top:10px; padding:8px 10px;"><div style="font-size:11px; font-weight:bold; color:#374151; text-transform:uppercase; margin-bottom:4px;">${titulo}</div><table style="width:100%; border-collapse:collapse; font-size:12px;">${linhas}</table></div>`
  const producao = d.ambiente !== '2'
  return `
    <div style="font-family: Arial, sans-serif; padding:16px; color:#1f2937; max-width:700px;">
      <table style="width:100%; border-collapse:collapse;"><tr>
        <td><div style="font-size:16px; font-weight:bold;">DANFSe — Documento Auxiliar da NFS-e</div>
            <div style="font-size:11px; color:#6b7280;">Nota Fiscal de Serviço Eletrônica · Padrão Nacional${producao ? '' : ' · AMBIENTE DE HOMOLOGAÇÃO'}</div></td>
        <td style="text-align:right; width:110px;">${qr ? `<img src="${qr}" style="width:96px; height:96px;" />` : ''}</td>
      </tr></table>
      ${bloco('Identificação da NFS-e',
        linha('Chave de acesso', e(chave), true) +
        linha('Número da NFS-e', e(d.numero), true) +
        linha('Competência', e(d.competencia ? fmtData(d.competencia) : '')) +
        linha('Emissão', e(fmtDataHora(d.processamento))) +
        linha('Local da prestação', e(d.local)))}
      ${bloco('Prestador do serviço',
        linha('Nome / Razão social', e(d.prestador.nome), true) +
        linha('CNPJ', e(fmtDocumento(d.prestador.doc))) +
        linha('Endereço', e(d.prestador.endereco)) +
        linha('Telefone / E-mail', e([d.prestador.fone, d.prestador.email].filter(Boolean).join(' · '))) +
        linha('Regime', 'Simples Nacional — ME/EPP'))}
      ${bloco('Tomador do serviço',
        linha('Nome / Razão social', e(d.tomador.nome), true) +
        linha('CPF / CNPJ', e(fmtDocumento(d.tomador.doc))) +
        linha('Endereço', e(d.tomador.endereco)) +
        linha('Telefone / E-mail', e([d.tomador.fone, d.tomador.email].filter(Boolean).join(' · '))))}
      ${bloco('Serviço prestado',
        linha('Código de tributação nacional', e(d.tribNac)) +
        linha('Serviço (NBS)', e(d.nbs)) +
        linha('Discriminação', e(d.descricao || nota.discriminacao)))}
      ${bloco('Valores',
        linha('Valor do serviço', fmtValor(d.valor), true) +
        linha('Valor líquido', fmtValor(d.liquido || d.valor), true) +
        linha('ISSQN', e(d.issRetido)) +
        (d.pTotTribSN ? linha('Total aproximado de tributos (Simples)', `${e(d.pTotTribSN)}%`) : ''))}
      <p style="font-size:10px; color:#9ca3af; margin-top:12px;">Documento gerado pelo sistema CARSANT a partir do XML da NFS-e. Para conferir a nota, leia o QR Code ou consulte a chave de acesso em nfse.gov.br.</p>
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
