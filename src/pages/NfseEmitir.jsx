import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, FileText, AlertTriangle, Search, Download, Mail, Archive, Printer, XCircle, Repeat, X } from 'lucide-react'
import { baixarComprovantePdf, gerarComprovantePdfBase64, textoParaBase64Utf8 } from '../lib/nfsePdf'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const STATUS_NOTA = {
  emitida: { label: 'Emitida', cor: 'bg-green-100 text-green-700' },
  erro: { label: 'Erro', cor: 'bg-red-100 text-red-700' },
  cancelada: { label: 'Cancelada', cor: 'bg-gray-100 text-gray-500' },
}

function fmtValor(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d) {
  if (!d) return '—'
  return new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR')
}

const emptyForm = {
  rpsNumero: '', // vazio = numerado automaticamente pelo backend
  rpsSerie: '1',
  competencia: new Date().toISOString().slice(0, 10),
  valorServicos: '',
  itemListaServico: '1719',
  discriminacao: '',
  tomadorNome: '',
  tomadorCnpj: '',
  tomadorEmail: '',
  tomadorTelefone: '',
  tomadorLogradouro: 'Avenida Getúlio Vargas',
  tomadorNumero: '2761',
  tomadorBairro: 'Santa Mônica',
  tomadorCep: '44001525',
}

const anoAtual = new Date().getFullYear()

const emptyConsulta = {
  tipo: 'porFaixa',
  // O número da NFS-e não é um contador simples: é ano + sequencial de 9
  // dígitos (ex: 2026000000001). NumeroNfseFinal também é obrigatório na
  // prática, mesmo o XSD marcando como opcional.
  numeroInicial: `${anoAtual}000000001`,
  numeroFinal: `${anoAtual}000000099`,
  dataInicial: new Date().toISOString().slice(0, 7) + '-01',
  dataFinal: new Date().toISOString().slice(0, 10),
  tomadorCnpj: '',
}

export default function NfseEmitir() {
  const { profile } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  const [consulta, setConsulta] = useState(emptyConsulta)
  const [consultando, setConsultando] = useState(false)
  const [resultadoConsulta, setResultadoConsulta] = useState(null)
  const [erroConsulta, setErroConsulta] = useState('')

  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [campoFiltroData, setCampoFiltroData] = useState('competencia') // 'competencia' | 'data_emissao'
  const [filtroAmbiente, setFiltroAmbiente] = useState('producao') // 'todos' | 'producao' | 'homologacao'
  const [filtroCnpj, setFiltroCnpj] = useState('')
  const [notas, setNotas] = useState([])
  const [carregandoNotas, setCarregandoNotas] = useState(false)
  const [enviandoId, setEnviandoId] = useState(null)
  const [baixandoId, setBaixandoId] = useState(null)
  const [exportandoLote, setExportandoLote] = useState(false)
  const [gerandoRelatorioPdf, setGerandoRelatorioPdf] = useState(false)
  const [cancelandoId, setCancelandoId] = useState(null)
  const [notaSubstituir, setNotaSubstituir] = useState(null) // nota sendo substituída
  const [formSubstituir, setFormSubstituir] = useState({
    valorServicos: '', discriminacao: '', competencia: '',
    tomadorNome: '', tomadorCnpj: '', tomadorEmail: '', tomadorTelefone: '',
    tomadorLogradouro: '', tomadorNumero: '', tomadorComplemento: '', tomadorBairro: '', tomadorCep: '', tomadorUf: '',
    tomadorCodigoMunicipioIbge: '',
  })
  const [substituindo, setSubstituindo] = useState(false)
  const previewRef = useRef(null)

  useEffect(() => { buscarNotas() }, [mes, ano, campoFiltroData, filtroAmbiente])

  async function buscarNotas() {
    setCarregandoNotas(true)
    try {
      const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`
      const fim = new Date(ano, mes, 0).toISOString().slice(0, 10)
      let query = supabase
        .from('notas_fiscais')
        .select('*, clientes(nome, email, cnpj, telefone, logradouro, numero_endereco, complemento, bairro, cep, uf, codigo_municipio_ibge)')
        .gte(campoFiltroData, inicio)
        .lte(campoFiltroData, campoFiltroData === 'data_emissao' ? `${fim}T23:59:59` : fim)
        .order(campoFiltroData, { ascending: false })
      if (filtroAmbiente !== 'todos') query = query.eq('ambiente', filtroAmbiente)
      const { data, error } = await query
      if (error) throw error
      setNotas(data || [])
    } catch (err) {
      alert(`Erro ao buscar notas fiscais: ${err.message}`)
    } finally {
      setCarregandoNotas(false)
    }
  }

  const notasFiltradas = notas.filter((n) => {
    if (!filtroCnpj) return true
    const alvo = filtroCnpj.replace(/\D/g, '')
    return (n.clientes?.cnpj || '').replace(/\D/g, '').includes(alvo)
  })

  function baixarXmlIndividual(nota) {
    if (!nota.xml_resposta) { alert('Esta nota não tem XML salvo.'); return }
    const blob = new Blob([nota.xml_resposta], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `NFSe-${nota.numero_nfse || nota.id}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Tenta o DANFSE oficial da Prefeitura (baixado da área logada do
  // prestador no WebISS) antes de cair pro comprovante próprio do sistema —
  // só existe pra notas de produção. Ver api/_webiss-portal.js.
  async function baixarDanfseOficialBase64(notaId) {
    const { data: { session } } = await supabase.auth.getSession()
    const resp = await fetch('/api/nfse-emitir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ acao: 'baixarDanfseOficial', notaId }),
    })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error || 'Falha ao baixar DANFSE oficial')
    return data.pdfBase64
  }

  function baixarBase64ComoArquivo(base64, nomeArquivo) {
    const binario = atob(base64)
    const bytes = new Uint8Array(binario.length)
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivo
    a.click()
    URL.revokeObjectURL(url)
  }

  async function baixarPdfIndividual(nota) {
    setBaixandoId(nota.id)
    try {
      if (nota.ambiente === 'producao' && nota.numero_nfse) {
        try {
          const base64 = await baixarDanfseOficialBase64(nota.id)
          baixarBase64ComoArquivo(base64, `DANFSe-${nota.numero_nfse}.pdf`)
          return
        } catch (err) {
          console.warn('DANFSE oficial indisponível, usando comprovante do sistema:', err.message)
        }
      }
      await baixarComprovantePdf(nota, nota.clientes)
    } catch (err) {
      alert(`Erro ao gerar PDF: ${err.message}`)
    } finally {
      setBaixandoId(null)
    }
  }

  async function enviarPorEmail(nota) {
    if (!nota.clientes?.email) { alert('Este cliente não tem e-mail cadastrado.'); return }
    setEnviandoId(nota.id)
    try {
      let pdfBase64 = null
      if (nota.ambiente === 'producao' && nota.numero_nfse) {
        try {
          pdfBase64 = await baixarDanfseOficialBase64(nota.id)
        } catch (err) {
          console.warn('DANFSE oficial indisponível, usando comprovante do sistema:', err.message)
        }
      }
      if (!pdfBase64) {
        pdfBase64 = await gerarComprovantePdfBase64(nota, nota.clientes)
      }
      const attachments = [{ filename: `NFSe-${nota.numero_nfse || nota.id}.pdf`, contentBase64: pdfBase64 }]
      if (nota.xml_resposta) {
        attachments.push({ filename: `NFSe-${nota.numero_nfse || nota.id}.xml`, contentBase64: textoParaBase64Utf8(nota.xml_resposta) })
      }
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          to: nota.clientes.email,
          subject: `Nota Fiscal ${nota.numero_nfse || ''} — CARSANT Contabilidade`,
          text: `Olá, ${nota.clientes.nome}! Segue em anexo a nota fiscal referente à competência de ${fmtData(nota.competencia)}, no valor de ${fmtValor(nota.valor_servicos)}.`,
          attachments,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || data.detail || 'Falha ao enviar e-mail')
      alert(`E-mail enviado para ${nota.clientes.email} com PDF e XML anexados.`)
    } catch (err) {
      alert(`Erro ao enviar: ${err.message}`)
    } finally {
      setEnviandoId(null)
    }
  }

  // Cancelamento/substituição têm efeito fiscal real perante a Prefeitura
  // (ver comentário em api/webiss-nfse.js) — pedido de confirmação extra,
  // digitando uma palavra, quando a nota é de produção (mesmo padrão já
  // usado pra emissão real em Clientes.jsx).
  async function cancelarNota(nota) {
    if (!window.confirm(`Cancelar a NFS-e nº ${nota.numero_nfse} de ${nota.clientes?.nome || '—'}?\n\nEsta ação tem efeito fiscal real perante a Prefeitura e não pode ser desfeita.`)) return
    if (nota.ambiente === 'producao') {
      const digitado = window.prompt('Nota REAL (produção). Digite CANCELAR para confirmar:')
      if (digitado !== 'CANCELAR') { alert('Confirmação incorreta — cancelamento não realizado.'); return }
    }
    setCancelandoId(nota.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/nfse-emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ acao: 'cancelar', notaId: nota.id }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao cancelar')
      alert(data.aviso || 'NFS-e cancelada com sucesso.')
      buscarNotas()
    } catch (err) {
      alert(`Erro ao cancelar: ${err.message}`)
    } finally {
      setCancelandoId(null)
    }
  }

  function abrirSubstituir(nota) {
    const c = nota.clientes || {}
    setNotaSubstituir(nota)
    setFormSubstituir({
      valorServicos: nota.valor_servicos || '',
      discriminacao: nota.discriminacao || '',
      competencia: nota.competencia ? String(nota.competencia).slice(0, 10) : new Date().toISOString().slice(0, 10),
      tomadorNome: c.nome || '',
      tomadorCnpj: (c.cnpj || '').replace(/\D/g, ''),
      tomadorEmail: c.email || '',
      tomadorTelefone: (c.telefone || '').replace(/\D/g, ''),
      tomadorLogradouro: c.logradouro || '',
      tomadorNumero: c.numero_endereco || '',
      tomadorComplemento: c.complemento || '',
      tomadorBairro: c.bairro || '',
      tomadorCep: (c.cep || '').replace(/\D/g, ''),
      tomadorUf: c.uf || '',
      tomadorCodigoMunicipioIbge: c.codigo_municipio_ibge || '',
    })
  }

  async function confirmarSubstituir() {
    const nota = notaSubstituir
    const f = formSubstituir
    if (!f.discriminacao || f.discriminacao.trim().length < 10) {
      alert('A discriminação precisa ter pelo menos 10 caracteres.')
      return
    }
    const cnpjLimpo = f.tomadorCnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      alert(`O CNPJ do tomador precisa ter exatamente 14 dígitos (tem ${cnpjLimpo.length}).`)
      return
    }
    if (!window.confirm(`Substituir a NFS-e nº ${nota.numero_nfse}? A nota atual será cancelada e uma nova será emitida no lugar.\n\nEsta ação tem efeito fiscal real perante a Prefeitura e não pode ser desfeita.`)) return
    if (nota.ambiente === 'producao') {
      const digitado = window.prompt('Nota REAL (produção). Digite SUBSTITUIR para confirmar:')
      if (digitado !== 'SUBSTITUIR') { alert('Confirmação incorreta — substituição não realizada.'); return }
    }
    setSubstituindo(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/nfse-emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          acao: 'substituir',
          notaId: nota.id,
          dados: {
            valorServicos: parseFloat(f.valorServicos) || 0,
            discriminacao: f.discriminacao,
            competencia: f.competencia,
            tomador: {
              razaoSocial: f.tomadorNome || undefined,
              cnpj: cnpjLimpo,
              email: f.tomadorEmail || undefined,
              telefone: f.tomadorTelefone.replace(/\D/g, '') || undefined,
              endereco: f.tomadorLogradouro ? {
                logradouro: f.tomadorLogradouro,
                numero: f.tomadorNumero,
                complemento: f.tomadorComplemento || undefined,
                bairro: f.tomadorBairro,
                cep: f.tomadorCep.replace(/\D/g, ''),
                uf: f.tomadorUf,
                codigoMunicipioIbge: f.tomadorCodigoMunicipioIbge,
              } : undefined,
            },
          },
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao substituir')
      alert(`Nova NFS-e emitida em substituição!\nNúmero: ${data.numero}\nCódigo de verificação: ${data.codigoVerificacao}`)
      setNotaSubstituir(null)
      buscarNotas()
    } catch (err) {
      alert(`Erro ao substituir: ${err.message}`)
    } finally {
      setSubstituindo(false)
    }
  }

  async function baixarXmlEmLote() {
    const comXml = notasFiltradas.filter((n) => n.xml_resposta)
    if (comXml.length === 0) { alert('Nenhuma nota do período selecionado tem XML salvo.'); return }
    setExportandoLote(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      comXml.forEach((n) => zip.file(`NFSe-${n.numero_nfse || n.id}.xml`, n.xml_resposta))
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `NFSe-XML-${MESES[mes - 1]}-${ano}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Erro ao gerar o lote: ${err.message}`)
    } finally {
      setExportandoLote(false)
    }
  }

  async function exportarRelatorioPdf() {
    setGerandoRelatorioPdf(true)
    try {
      if (!window.html2pdf) {
        await import('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js')
      }
      const html2pdf = window.html2pdf
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `CARSANT-NotasFiscais-${MESES[mes - 1]}-${ano}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      }
      await html2pdf().set(opt).from(previewRef.current).save()
    } catch (e) {
      window.print()
    } finally {
      setGerandoRelatorioPdf(false)
    }
  }

  const anosDisponiveis = [anoAtual - 1, anoAtual, anoAtual + 1]
  const totalNotas = notasFiltradas.reduce((s, n) => s + Number(n.valor_servicos || 0), 0)

  if (profile?.role !== 'gestor') {
    return <div className="p-8 text-center text-gray-500">Acesso restrito ao gestor.</div>
  }

  async function consultar(e) {
    e.preventDefault()
    setErroConsulta('')
    setResultadoConsulta(null)
    setConsultando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const filtros = consulta.tipo === 'porFaixa'
        ? {
            numeroInicial: consulta.numeroInicial,
            numeroFinal: consulta.numeroFinal || undefined,
          }
        : {
            periodoEmissao: { inicial: consulta.dataInicial, final: consulta.dataFinal },
            tomadorCnpj: consulta.tomadorCnpj.replace(/\D/g, '') || undefined,
          }
      const resp = await fetch('/api/nfse-consultar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ ambiente: 'homologacao', tipo: consulta.tipo, filtros }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao consultar NFS-e')
      setResultadoConsulta(data)
    } catch (err) {
      setErroConsulta(err.message)
    } finally {
      setConsultando(false)
    }
  }

  async function emitir(e) {
    e.preventDefault()
    setErro('')
    setResultado(null)

    const cnpjLimpo = form.tomadorCnpj.replace(/\D/g, '')
    if (cnpjLimpo && cnpjLimpo.length !== 14) {
      setErro(`O CNPJ do tomador precisa ter exatamente 14 dígitos (tem ${cnpjLimpo.length}). O WebISS exige esse tamanho exato — evite gastar tentativas testando um valor errado.`)
      return
    }
    if (form.discriminacao.trim().length < 10) {
      setErro('A discriminação do serviço precisa ter pelo menos 10 caracteres.')
      return
    }

    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/nfse-emitir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          ambiente: 'homologacao',
          dados: {
            rpsNumero: form.rpsNumero || undefined,
            rpsSerie: form.rpsSerie,
            competencia: form.competencia,
            valorServicos: parseFloat(form.valorServicos) || 0,
            itemListaServico: form.itemListaServico,
            discriminacao: form.discriminacao,
            tomador: {
              razaoSocial: form.tomadorNome || undefined,
              cnpj: cnpjLimpo || undefined,
              email: form.tomadorEmail || undefined,
              telefone: form.tomadorTelefone.replace(/\D/g, '') || undefined,
              endereco: {
                logradouro: form.tomadorLogradouro,
                numero: form.tomadorNumero,
                bairro: form.tomadorBairro,
                cep: form.tomadorCep.replace(/\D/g, ''),
                uf: 'BA',
                codigoMunicipioIbge: '2910800',
                codigoPais: '1058',
              },
            },
          },
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao emitir NFS-e')
      setResultado(data)
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notas Fiscais</h1>
        <p className="text-sm text-gray-500 mt-1">Notas emitidas, filtradas por competência ou data de emissão, com exportação e envio ao cliente.</p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="form-group">
              <label className="form-label">Filtrar por</label>
              <select className="select" value={campoFiltroData} onChange={(e) => setCampoFiltroData(e.target.value)}>
                <option value="competencia">Competência</option>
                <option value="data_emissao">Data de emissão</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Mês</label>
              <select className="select" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ano</label>
              <select className="select" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ambiente</label>
              <select className="select" value={filtroAmbiente} onChange={(e) => setFiltroAmbiente(e.target.value)}>
                <option value="producao">Só notas reais (produção)</option>
                <option value="homologacao">Só notas de teste (homologação)</option>
                <option value="todos">Todas</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">CPF/CNPJ do tomador</label>
              <input
                className="input"
                value={filtroCnpj}
                onChange={(e) => setFiltroCnpj(e.target.value)}
                placeholder="Filtrar por CPF ou CNPJ"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportarRelatorioPdf} disabled={gerandoRelatorioPdf || notasFiltradas.length === 0} className="btn-secondary btn-sm gap-1.5">
              {gerandoRelatorioPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />} Exportar relatório em PDF
            </button>
            <button onClick={baixarXmlEmLote} disabled={exportandoLote || notasFiltradas.length === 0} className="btn-secondary btn-sm gap-1.5">
              {exportandoLote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />} Baixar XML em lote
            </button>
          </div>
        </div>

        {carregandoNotas ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
        ) : (
          <div ref={previewRef} className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th><th>Número</th><th>Competência</th><th>Emissão</th>
                  {filtroAmbiente === 'todos' && <th>Ambiente</th>}
                  <th>Valor</th><th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {notasFiltradas.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <div className="font-medium text-gray-900">{n.clientes?.nome || '—'}</div>
                      {n.clientes?.email && <div className="text-xs text-gray-500">{n.clientes.email}</div>}
                    </td>
                    <td>{n.numero_nfse || '—'}</td>
                    <td>{fmtData(n.competencia)}</td>
                    <td>{n.data_emissao ? new Date(n.data_emissao).toLocaleDateString('pt-BR') : '—'}</td>
                    {filtroAmbiente === 'todos' && (
                      <td>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${n.ambiente === 'producao' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                          {n.ambiente === 'producao' ? 'Real' : 'Teste'}
                        </span>
                      </td>
                    )}
                    <td className="font-medium">{fmtValor(n.valor_servicos)}</td>
                    <td>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_NOTA[n.status]?.cor || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_NOTA[n.status]?.label || n.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => baixarXmlIndividual(n)} className="btn-ghost btn-sm p-1.5" title="Baixar XML">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => baixarPdfIndividual(n)} disabled={baixandoId === n.id} className="btn-ghost btn-sm p-1.5" title="Baixar comprovante em PDF">
                          {baixandoId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => enviarPorEmail(n)} disabled={enviandoId === n.id || !n.clientes?.email} className="btn-ghost btn-sm p-1.5 text-brand-600" title="Enviar PDF + XML por e-mail">
                          {enviandoId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                        </button>
                        {n.status === 'emitida' && (
                          <>
                            <button onClick={() => abrirSubstituir(n)} className="btn-ghost btn-sm p-1.5 text-amber-600" title="Substituir por uma nova NFS-e">
                              <Repeat className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => cancelarNota(n)} disabled={cancelandoId === n.id} className="btn-ghost btn-sm p-1.5 text-red-600" title="Cancelar NFS-e">
                              {cancelandoId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {notasFiltradas.length === 0 && (
                  <tr><td colSpan={filtroAmbiente === 'todos' ? 8 : 7} className="text-center py-8 text-gray-500">Nenhuma nota fiscal encontrada</td></tr>
                )}
              </tbody>
              {notasFiltradas.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={filtroAmbiente === 'todos' ? 5 : 4} className="text-right font-semibold text-gray-700">Total</td>
                    <td className="font-bold text-gray-900">{fmtValor(totalNotas)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {notaSubstituir && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setNotaSubstituir(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="text-lg font-semibold text-gray-900">Substituir NFS-e nº {notaSubstituir.numero_nfse}</h2>
              <button onClick={() => setNotaSubstituir(null)} className="btn-ghost p-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-yellow-800">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span>A nota atual será <strong>cancelada</strong> e uma nova NFS-e será emitida com os dados abaixo.</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Competência</label>
                  <input type="date" className="input" value={formSubstituir.competencia} onChange={(e) => setFormSubstituir((f) => ({ ...f, competencia: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Valor dos Serviços (R$)</label>
                  <input type="number" step="0.01" className="input" value={formSubstituir.valorServicos} onChange={(e) => setFormSubstituir((f) => ({ ...f, valorServicos: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Discriminação do serviço</label>
                <textarea className="textarea" rows={3} value={formSubstituir.discriminacao} onChange={(e) => setFormSubstituir((f) => ({ ...f, discriminacao: e.target.value }))} />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Tomador</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label">Nome / Razão social</label>
                    <input className="input" value={formSubstituir.tomadorNome} onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorNome: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CNPJ</label>
                    <input
                      className="input"
                      value={formSubstituir.tomadorCnpj}
                      onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorCnpj: e.target.value.replace(/\D/g, '').slice(0, 14) }))}
                      maxLength={14}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">E-mail</label>
                    <input type="email" className="input" value={formSubstituir.tomadorEmail} onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorEmail: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Telefone</label>
                    <input className="input" value={formSubstituir.tomadorTelefone} onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorTelefone: e.target.value }))} />
                  </div>
                  <div className="form-group col-span-2">
                    <label className="form-label">Logradouro</label>
                    <input className="input" value={formSubstituir.tomadorLogradouro} onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorLogradouro: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Número</label>
                    <input className="input" value={formSubstituir.tomadorNumero} onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorNumero: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Complemento</label>
                    <input className="input" value={formSubstituir.tomadorComplemento} onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorComplemento: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Bairro</label>
                    <input className="input" value={formSubstituir.tomadorBairro} onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorBairro: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">CEP</label>
                    <input className="input" value={formSubstituir.tomadorCep} onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorCep: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">UF</label>
                    <input className="input" maxLength={2} value={formSubstituir.tomadorUf} onChange={(e) => setFormSubstituir((f) => ({ ...f, tomadorUf: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setNotaSubstituir(null)} className="btn-secondary">Cancelar</button>
              <button onClick={confirmarSubstituir} disabled={substituindo} className="btn-primary">
                {substituindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
                {substituindo ? 'Substituindo...' : 'Confirmar substituição'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Emitir NFS-e — WebISS (homologação)</h2>
        <p className="text-sm text-gray-500 mb-4">Ferramenta de teste — integração direta com a Prefeitura de Feira de Santana (padrão ABRASF 2.02). A emissão real acontece pela tela de Clientes.</p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-yellow-800">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <span>Ambiente fixo em <strong>HOMOLOGAÇÃO</strong> (teste) por enquanto — nenhuma nota fiscal real é emitida aqui.</span>
      </div>

      <form onSubmit={emitir} className="card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="form-label">Número do RPS (vazio = automático)</label>
            <input className="input" value={form.rpsNumero} onChange={e => setForm(f => ({ ...f, rpsNumero: e.target.value }))} placeholder="automático" />
          </div>
          <div className="form-group">
            <label className="form-label">Série</label>
            <input className="input" value={form.rpsSerie} onChange={e => setForm(f => ({ ...f, rpsSerie: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Competência</label>
            <input type="date" className="input" value={form.competencia} onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Valor dos Serviços (R$)</label>
            <input type="number" step="0.01" className="input" value={form.valorServicos} onChange={e => setForm(f => ({ ...f, valorServicos: e.target.value }))} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Discriminação do serviço</label>
          <textarea className="textarea" rows={2} value={form.discriminacao} onChange={e => setForm(f => ({ ...f, discriminacao: e.target.value }))} placeholder="Ex: Serviços de contabilidade — teste de homologação" />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Tomador (dados fictícios para teste)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Nome / Razão social</label>
              <input className="input" value={form.tomadorNome} onChange={e => setForm(f => ({ ...f, tomadorNome: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">CNPJ (fictício)</label>
              <input
                className="input"
                value={form.tomadorCnpj}
                onChange={e => setForm(f => ({ ...f, tomadorCnpj: e.target.value.replace(/\D/g, '').slice(0, 14) }))}
                placeholder="11222333000181 (14 dígitos)"
                maxLength={14}
              />
            </div>
            <div className="form-group">
              <label className="form-label">E-mail (seu, para teste)</label>
              <input type="email" className="input" value={form.tomadorEmail} onChange={e => setForm(f => ({ ...f, tomadorEmail: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="input" value={form.tomadorTelefone} onChange={e => setForm(f => ({ ...f, tomadorTelefone: e.target.value }))} placeholder="75999999999" />
            </div>
            <div className="form-group col-span-2">
              <label className="form-label">Logradouro</label>
              <input className="input" value={form.tomadorLogradouro} onChange={e => setForm(f => ({ ...f, tomadorLogradouro: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="input" value={form.tomadorNumero} onChange={e => setForm(f => ({ ...f, tomadorNumero: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="input" value={form.tomadorBairro} onChange={e => setForm(f => ({ ...f, tomadorBairro: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">CEP</label>
              <input className="input" value={form.tomadorCep} onChange={e => setForm(f => ({ ...f, tomadorCep: e.target.value }))} />
            </div>
            <div className="form-group flex items-end">
              <p className="text-xs text-gray-500">Cidade/UF/País fixos em Feira de Santana/BA/Brasil para este teste.</p>
            </div>
          </div>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <div className="whitespace-pre-wrap break-words">{erro}</div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(erro)}
              className="mt-2 text-xs font-medium text-red-800 underline"
            >
              Copiar erro completo
            </button>
          </div>
        )}

        <button type="submit" disabled={enviando} className="btn-primary gap-2">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {enviando ? 'Enviando ao WebISS...' : 'Emitir NFS-e (Homologação)'}
        </button>
      </form>

      {resultado && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-green-700 mb-3">✅ NFS-e emitida ({resultado.ambiente})</h3>
          {resultado.numero && (
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div><span className="text-gray-500">Número:</span> <strong>{resultado.numero}</strong></div>
              <div><span className="text-gray-500">Código de verificação:</span> <strong>{resultado.codigoVerificacao}</strong></div>
            </div>
          )}
          <details>
            <summary className="text-xs text-gray-500 cursor-pointer">Ver XML completo da resposta</summary>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap mt-2">{resultado.resultadoXml}</pre>
          </details>
        </div>
      )}

      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Consultar NFS-e emitidas</h2>
        <p className="text-sm text-gray-500 mb-4">Útil para descobrir o próximo número de RPS a usar e para conferir notas já emitidas.</p>

        <form onSubmit={consultar} className="card p-5 space-y-4">
          <div className="form-group">
            <label className="form-label">Tipo de consulta</label>
            <select
              className="select"
              value={consulta.tipo}
              onChange={e => setConsulta(c => ({ ...c, tipo: e.target.value }))}
            >
              <option value="porFaixa">Por número (faixa)</option>
              <option value="porPeriodo">Por período de emissão</option>
            </select>
          </div>

          {consulta.tipo === 'porFaixa' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Número inicial</label>
                <input className="input" value={consulta.numeroInicial} onChange={e => setConsulta(c => ({ ...c, numeroInicial: e.target.value.replace(/\D/g, '') }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Número final</label>
                <input className="input" value={consulta.numeroFinal} onChange={e => setConsulta(c => ({ ...c, numeroFinal: e.target.value.replace(/\D/g, '') }))} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Data inicial</label>
                <input type="date" className="input" value={consulta.dataInicial} onChange={e => setConsulta(c => ({ ...c, dataInicial: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Data final</label>
                <input type="date" className="input" value={consulta.dataFinal} onChange={e => setConsulta(c => ({ ...c, dataFinal: e.target.value }))} />
              </div>
              <div className="form-group col-span-2">
                <label className="form-label">CNPJ do tomador (opcional, filtra por cliente)</label>
                <input
                  className="input"
                  value={consulta.tomadorCnpj}
                  onChange={e => setConsulta(c => ({ ...c, tomadorCnpj: e.target.value.replace(/\D/g, '').slice(0, 14) }))}
                  maxLength={14}
                />
              </div>
            </div>
          )}

          {erroConsulta && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <div className="whitespace-pre-wrap break-words">{erroConsulta}</div>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(erroConsulta)}
                className="mt-2 text-xs font-medium text-red-800 underline"
              >
                Copiar erro completo
              </button>
            </div>
          )}

          <button type="submit" disabled={consultando} className="btn-primary gap-2">
            {consultando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {consultando ? 'Consultando...' : 'Consultar'}
          </button>
        </form>

        {resultadoConsulta && (
          <div className="card p-5 mt-4">
            <h3 className="text-sm font-semibold text-green-700 mb-3">✅ Resposta do WebISS ({resultadoConsulta.ambiente})</h3>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap">{resultadoConsulta.resultadoXml}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
