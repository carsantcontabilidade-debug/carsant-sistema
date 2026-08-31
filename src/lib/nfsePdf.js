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
        Para validar o documento oficial (DANFSE), acesse o portal da Prefeitura de Feira de Santana (WebISS) e informe o código de verificação acima.
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

export async function baixarComprovantePdf(nota, cliente) {
  const html2pdf = await carregarHtml2Pdf()
  const html = montarHtmlComprovante(nota, cliente)
  await comContainerTemporario(html, (container) =>
    html2pdf()
      .set({ margin: 10, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, filename: `NFSe-${nota.numero_nfse || nota.id}.pdf` })
      .from(container)
      .save()
  )
}

export async function gerarComprovantePdfBase64(nota, cliente) {
  const html2pdf = await carregarHtml2Pdf()
  const html = montarHtmlComprovante(nota, cliente)
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
