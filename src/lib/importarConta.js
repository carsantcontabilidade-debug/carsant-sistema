// src/lib/importarConta.js
// Leitura automática de XML de nota fiscal (NF-e/NFS-e) ou PDF de boleto
// (FGTS, INSS, água, luz, telefone, plano de saúde etc.) para pré-preencher
// o cadastro em Contas a Pagar. Sempre passa por uma tela de conferência
// antes de salvar — nada disso é garantido 100%, é leitura automática que
// PRECISA ser revisada.
//
// XML: leitura direta de tags estruturadas (confiável, mesmo estilo de
// regex tag-a-tag já usado em api/webiss-nfse.js — sem dependência de
// parser XML).
//
// PDF: a única parte 100% confiável é a linha digitável do boleto (padrão
// FEBRABAN, igual pra qualquer emissor no Brasil) — dá valor e vencimento
// certos pra boleto bancário; pra guias de arrecadação (FGTS/INSS/tributos,
// que começam com "8"), só o valor vem do código, o vencimento não é
// padronizado no próprio código e por isso é procurado no texto do PDF
// como reforço. Nome do fornecedor é sempre uma tentativa heurística.

// pdfjs-dist é carregado sob demanda (import dinâmico) só quando um PDF
// é de fato processado — evita inflar o bundle de quem só usa XML ou o
// cadastro manual.
async function carregarPdfjs() {
  const pdfjsLib = await import('pdfjs-dist')
  const { default: pdfWorkerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  return pdfjsLib
}

function tag(xml, nome) {
  const m = xml.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)<\\/${nome}>`))
  return m?.[1]?.trim()
}

function normalizarData(raw) {
  if (!raw) return null
  return raw.slice(0, 10)
}

function formatarCnpj(digitosOuFormatado) {
  const d = String(digitosOuFormatado).replace(/\D/g, '')
  if (d.length !== 14) return digitosOuFormatado
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

// ─── XML (NF-e de produto ou NFS-e de serviço) ─────────────────────────────
//
// A primeira ocorrência de cada tag é sempre a do emitente/prestador (que
// vem antes do destinatário/tomador na ordem do XML) — mesma premissa já
// usada e documentada em parseNfseResposta (api/webiss-nfse.js).
export function analisarXmlNota(xmlTexto) {
  const ehNFe = /<infNFe[\s>]|<NFe[\s>]/.test(xmlTexto)
  const ehNFSe = /<InfNfse[\s>]|<Nfse[\s>]/.test(xmlTexto)

  if (ehNFe) {
    const nome = tag(xmlTexto, 'xNome')
    const cnpj = tag(xmlTexto, 'CNPJ')
    const valor = tag(xmlTexto, 'vNF')
    const dataEmissao = tag(xmlTexto, 'dhEmi') || tag(xmlTexto, 'dEmi')
    const primeiroProduto = tag(xmlTexto, 'xProd')
    const dVenc = tag(xmlTexto, 'dVenc')
    return {
      tipo: 'nfe',
      fornecedor: nome || '',
      cnpj: cnpj ? formatarCnpj(cnpj) : '',
      valor: valor ? Number(valor) : null,
      dataEmissao: normalizarData(dataEmissao),
      vencimento: normalizarData(dVenc),
      descricao: primeiroProduto ? `NF-e — ${primeiroProduto}` : 'Nota Fiscal Eletrônica (NF-e)',
    }
  }

  if (ehNFSe) {
    const nome = tag(xmlTexto, 'RazaoSocial')
    const cnpj = tag(xmlTexto, 'Cnpj')
    const valor = tag(xmlTexto, 'ValorServicos') || tag(xmlTexto, 'ValorLiquidoNfse')
    const dataEmissao = tag(xmlTexto, 'DataEmissao')
    const discriminacao = tag(xmlTexto, 'Discriminacao')
    return {
      tipo: 'nfse',
      fornecedor: nome || '',
      cnpj: cnpj ? formatarCnpj(cnpj) : '',
      valor: valor ? Number(valor) : null,
      dataEmissao: normalizarData(dataEmissao),
      vencimento: null,
      descricao: discriminacao ? discriminacao.slice(0, 200) : 'Nota Fiscal de Serviço (NFS-e)',
    }
  }

  throw new Error('Não foi possível reconhecer este XML como NF-e ou NFS-e.')
}

// ─── PDF (boleto: FGTS, INSS, água, luz, telefone, plano de saúde...) ──────

// Muitas faturas (telecom, concessionárias) vêm com o PDF protegido por
// senha — geralmente o CNPJ do destinatário. Quando não vem senha, o
// pdfjs-dist recusa com um PasswordException (err.name), que é tratado
// separadamente na tela pra pedir a senha ao usuário, em vez de só falhar.
export class PdfProtegidoPorSenha extends Error {}

async function extrairTextoPdf(arrayBuffer, senha) {
  const pdfjsLib = await carregarPdfjs()
  let pdf
  try {
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer, password: senha || undefined }).promise
  } catch (err) {
    if (err?.name === 'PasswordException') throw new PdfProtegidoPorSenha(senha ? 'Senha incorreta.' : 'Este PDF está protegido por senha.')
    throw err
  }
  // Agrupa os itens de texto em linhas de verdade, comparando a posição Y
  // de um item pro próximo — juntar tudo com um espaço só (ignorando o
  // layout) grudava blocos de texto diferentes (ex: nome do Cedente com o
  // endereço do Sacado do lado, ou a linha digitável com o texto vizinho),
  // o que quebrava tanto a busca da linha digitável quanto a do fornecedor.
  let textoCompleto = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    let ultimaY = null
    let linha = ''
    for (const item of content.items) {
      const y = item.transform[5]
      if (ultimaY !== null && Math.abs(y - ultimaY) > 2) {
        textoCompleto += linha.trim() + '\n'
        linha = ''
      }
      linha += item.str + ' '
      ultimaY = y
    }
    textoCompleto += linha.trim() + '\n'
  }
  return textoCompleto
}

function extrairDigitos(str) {
  return str.replace(/\D/g, '')
}

// Procura sequências de dígitos com pontos/espaços que, ao remover os
// separadores, resultam em 47 (boleto bancário) ou 48 dígitos
// (arrecadação/convênio) — os dois formatos de linha digitável
// padronizados pela FEBRABAN pra qualquer boleto emitido no Brasil.
function encontrarLinhaDigitavel(texto) {
  const candidatos = texto.match(/\d[\d.\s]{35,70}\d/g) || []
  for (const c of candidatos) {
    const digitos = extrairDigitos(c)
    if (digitos.length === 47 || digitos.length === 48) return digitos
  }
  return null
}

// Fator de vencimento — dias corridos desde uma data-base FEBRABAN.
// ATENÇÃO: a data-base mudou em 22/02/2025 (fator "1000"), porque o
// esquema antigo (base 07/10/1997) esgotou em fator 9999 = 21/02/2025.
// Qualquer boleto emitido a partir dessa data (ou seja, praticamente
// todo boleto processado por este sistema, hoje em diante) usa a NOVA
// contagem — confirmado via comunicados oficiais da FEBRABAN.
function fatorParaData(fator) {
  if (!fator) return null
  const baseNova = Date.UTC(2025, 1, 22) // 22/02/2025, fator = 1000
  const dias = fator - 1000
  const data = new Date(baseNova + dias * 86400000)
  return data.toISOString().slice(0, 10)
}

function decodificarBoleto(digitos) {
  if (digitos.length === 47) {
    const fatorVencimento = Number(digitos.slice(33, 37))
    const valor = Number(digitos.slice(37, 47)) / 100
    return { tipo: 'bancario', valor, vencimento: fatorParaData(fatorVencimento), linhaDigitavel: digitos }
  }
  if (digitos.length === 48) {
    // Reconstrói o código de barras (44 dígitos) removendo os 4 dígitos
    // verificadores de bloco intercalados na linha digitável de 48.
    const barcode = digitos.slice(0, 11) + digitos.slice(12, 23) + digitos.slice(24, 35) + digitos.slice(36, 47)
    const identificadorValor = barcode[2]
    // "1" = valor efetivo em reais no próprio código (caso mais comum);
    // outros identificadores (referência/isento) não têm valor codificado.
    const valor = identificadorValor === '1' ? Number(barcode.slice(4, 15)) / 100 : null
    return { tipo: 'arrecadacao', valor, vencimento: null, linhaDigitavel: digitos }
  }
  return null
}

function normalizarDataBr(dmy) {
  const [d, m, y] = dmy.split('/')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function buscarVencimentoNoTexto(texto) {
  const comRotulo = texto.match(/Vencimento[:\s]*([0-3]?\d\/[01]?\d\/20\d{2})/i)
  if (comRotulo) return normalizarDataBr(comRotulo[1])
  const generico = texto.match(/\b([0-3]?\d\/[01]?\d\/20\d{2})\b/)
  return generico ? normalizarDataBr(generico[1]) : null
}

// Prioridade 1: rótulo explícito "Cedente"/"Beneficiário" (quem EMITE a
// cobrança — o fornecedor de verdade) — bem mais confiável que adivinhar
// pela primeira linha, que às vezes pega o "Sacado"/"Pagador" (quem está
// sendo cobrado) por estar posicionado antes no texto extraído.
// Prioridade 2 (fallback): primeira linha com letras suficientes que não
// seja um rótulo genérico do boleto. Nunca é garantido, por isso sempre
// revisar antes de salvar.
function buscarFornecedor(texto) {
  const cnpjMatch = texto.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/)

  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const idxCedente = linhas.findIndex((l) => /^(Cedente|Benefici[aá]rio)\b/i.test(l))
  if (idxCedente !== -1) {
    // O nome normalmente vem depois do rótulo, na mesma linha (ex:
    // "Cedente: CLARO S.A. CNPJ 40.432.544/...") ou logo na linha seguinte.
    const mesmaLinha = linhas[idxCedente].replace(/^(Cedente|Benefici[aá]rio)\b[:\s]*/i, '').trim()
    const candidato = mesmaLinha.length > 3 ? mesmaLinha : linhas[idxCedente + 1]
    if (candidato) {
      const nomeLimpo = candidato.replace(/\s*(CNPJ|CPF)[:\s]*[\d.\-/]+.*$/i, '').trim()
      return { cnpj: cnpjMatch?.[1] || '', fornecedor: nomeLimpo || candidato }
    }
  }

  const rotulosGenericos = /^(boleto|recibo|via|banco|pagador|sacado|benefici[aá]rio|cedente|vencimento|valor|documento|n[uú]mero|nosso n[uú]mero|ag[eê]ncia|c[oó]digo)/i
  const nomeCandidato = linhas.find((l) => /[A-Za-zÀ-ÿ]{4,}/.test(l) && !rotulosGenericos.test(l))
  return { cnpj: cnpjMatch?.[1] || '', fornecedor: nomeCandidato || '' }
}

export async function analisarPdfBoleto(arrayBuffer, senha) {
  const texto = await extrairTextoPdf(arrayBuffer, senha)
  const linha = encontrarLinhaDigitavel(texto)
  const decodificado = linha ? decodificarBoleto(linha) : null
  const vencimentoTexto = buscarVencimentoNoTexto(texto)
  const { cnpj, fornecedor } = buscarFornecedor(texto)

  return {
    valor: decodificado?.valor ?? null,
    vencimento: decodificado?.vencimento || vencimentoTexto,
    fornecedor,
    cnpj: cnpj ? formatarCnpj(cnpj) : '',
    linhaDigitavel: decodificado?.linhaDigitavel || null,
    tipoBoleto: decodificado?.tipo || null,
    textoExtraido: texto,
  }
}
