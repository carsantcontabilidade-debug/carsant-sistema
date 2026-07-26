import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sanitizarNomeArquivo } from '../lib/storage'
import {
  TIPOS_CERTIDAO, statusCertidao, STATUS_LABEL, STATUS_COR, certidoesAtuais,
  PORTAL_OFICIAL, MUNICIPIOS_AUTOMATIZADOS, ESTADOS_AUTOMATIZADOS,
  PORTAL_OFICIAL_ESTADUAL, PORTAL_OFICIAL_MUNICIPAL,
} from '../lib/certidoes'
import { Loader2, Search, FileText, Zap, ExternalLink } from 'lucide-react'

// Municipal e Estadual só têm emissão automática de verdade pra alguns
// lugares específicos (ver MUNICIPIOS_AUTOMATIZADOS/ESTADOS_AUTOMATIZADOS
// em lib/certidoes.js) — checar por cliente, não só pelo tipo, senão o
// botão de raio aparece pra cidade que não tem suporte nenhum.
function temAutomacao(cliente, tipo) {
  if (tipo === 'municipal') return MUNICIPIOS_AUTOMATIZADOS.includes(cliente.codigo_municipio_ibge)
  if (tipo === 'estadual') return ESTADOS_AUTOMATIZADOS.includes(cliente.uf)
  return false
}

// Link de apoio (abrir portal oficial) pro cliente+tipo, quando não
// existe automação — igual ao padrão já usado em Federal/FGTS/
// Trabalhista/Falência.
function portalDeApoio(cliente, tipo) {
  if (PORTAL_OFICIAL[tipo]) return PORTAL_OFICIAL[tipo]
  if (tipo === 'municipal') return PORTAL_OFICIAL_MUNICIPAL[cliente.codigo_municipio_ibge]
  if (tipo === 'estadual') return PORTAL_OFICIAL_ESTADUAL[cliente.uf]
  return null
}

function fmtData(d) {
  if (!d) return ''
  return d.split('-').reverse().join('/')
}

export default function Certidoes() {
  const [clientes, setClientes] = useState([])
  const [certidoes, setCertidoes] = useState([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { cliente, tipo, atual }
  const [form, setForm] = useState({ data_emissao: '', data_validade: '', observacoes: '' })
  const [arquivo, setArquivo] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [emitindo, setEmitindo] = useState(null) // `${clienteId}|${tipo}` em andamento

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const [clientesRes, certidoesRes] = await Promise.all([
      supabase.from('clientes').select('id, nome, regime, cnpj, uf, codigo_municipio_ibge').order('nome'),
      supabase.from('certidoes').select('*'),
    ])
    setClientes(clientesRes.data || [])
    setCertidoes(certidoesRes.data || [])
    setLoading(false)
  }

  function abrirModal(cliente, tipo, atual) {
    setModal({ cliente, tipo, atual })
    setForm({
      data_emissao: atual?.data_emissao || '',
      data_validade: atual?.data_validade || '',
      observacoes: '',
    })
    setArquivo(null)
  }

  async function salvar(e) {
    e.preventDefault()
    if (!form.data_validade) return
    setSalvando(true)
    try {
      let storage_path = null
      let nome_arquivo = null
      if (arquivo) {
        const path = `${modal.cliente.id}/${modal.tipo}_${Date.now()}_${sanitizarNomeArquivo(arquivo.name)}`
        const { error: uploadError } = await supabase.storage.from('certidoes').upload(path, arquivo)
        if (uploadError) throw uploadError
        storage_path = path
        nome_arquivo = arquivo.name
      }

      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('certidoes').insert({
        cliente_id: modal.cliente.id,
        tipo: modal.tipo,
        data_emissao: form.data_emissao || null,
        data_validade: form.data_validade,
        observacoes: form.observacoes || null,
        storage_path,
        nome_arquivo,
        registrado_por: user?.id,
      })
      if (error) throw error

      setModal(null)
      carregar()
    } catch (err) {
      alert(`Não foi possível salvar: ${err.message}`)
    } finally {
      setSalvando(false)
    }
  }

  async function emitirAutomatico(cliente, tipo) {
    if (!cliente.cnpj) { alert('Este cliente não tem CNPJ cadastrado.'); return }
    const chave = `${cliente.id}|${tipo}`
    setEmitindo(chave)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/certidao-emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ clienteId: cliente.id, tipo }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao emitir.')
      if (!data.sucesso) {
        alert(`Não foi possível emitir automaticamente: ${data.motivo}`)
        return
      }
      if (!data.negativa) {
        alert('Certidão emitida, mas atenção: não parece ser uma certidão negativa — confira o arquivo salvo.')
      }
      carregar()
    } catch (err) {
      alert(`Erro ao emitir automaticamente: ${err.message}`)
    } finally {
      setEmitindo(null)
    }
  }

  async function abrirPortalOficial(cliente, tipo) {
    if (cliente.cnpj) {
      try { await navigator.clipboard.writeText(cliente.cnpj.replace(/\D/g, '')) } catch { /* clipboard pode não estar disponível */ }
    }
    window.open(portalDeApoio(cliente, tipo), '_blank')
  }

  async function baixarAnexo(atual) {
    if (!atual?.storage_path) return
    const { data, error } = await supabase.storage.from('certidoes').createSignedUrl(atual.storage_path, 300)
    if (error || !data) { alert('Não foi possível abrir o anexo.'); return }
    window.open(data.signedUrl, '_blank')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
  }

  const certidoesPorCliente = {}
  for (const c of clientes) {
    certidoesPorCliente[c.id] = certidoesAtuais(certidoes.filter((cert) => cert.cliente_id === c.id))
  }

  const clientesFiltrados = clientes.filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()))

  const totalVencidas = clientes.reduce((soma, c) => soma + Object.values(certidoesPorCliente[c.id]).filter((cert) => statusCertidao(cert.data_validade) === 'vencida').length, 0)
  const totalVencendo = clientes.reduce((soma, c) => soma + Object.values(certidoesPorCliente[c.id]).filter((cert) => statusCertidao(cert.data_validade) === 'vencendo').length, 0)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">📜 Certidões Negativas</h1>
        <p className="text-sm text-gray-500 mt-1">Painel de lembrete de validade — registro manual, não renovação automática.</p>
      </div>

      {(totalVencidas > 0 || totalVencendo > 0) && (
        <div className="flex flex-wrap gap-2">
          {totalVencidas > 0 && (
            <span className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-xl font-medium">
              {totalVencidas} certidão{totalVencidas > 1 ? 'ões' : ''} vencida{totalVencidas > 1 ? 's' : ''}
            </span>
          )}
          {totalVencendo > 0 && (
            <span className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-2 rounded-xl font-medium">
              {totalVencendo} vencendo nos próximos 15 dias
            </span>
          )}
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 sticky left-0 bg-white">Cliente</th>
              {TIPOS_CERTIDAO.map((t) => (
                <th key={t.id} className="text-center px-3 py-3 font-semibold text-gray-700 whitespace-nowrap">{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientesFiltrados.map((c) => (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-white">{c.nome}</td>
                {TIPOS_CERTIDAO.map((t) => {
                  const atual = certidoesPorCliente[c.id]?.[t.id]
                  const status = statusCertidao(atual?.data_validade)
                  const chave = `${c.id}|${t.id}`
                  const automatizavel = temAutomacao(c, t.id)
                  return (
                    <td key={t.id} className="px-3 py-2.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => abrirModal(c, t.id, atual)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium border ${STATUS_COR[status]} hover:opacity-75`}
                          title={atual?.data_validade ? `Válida até ${fmtData(atual.data_validade)}` : 'Clique para registrar'}
                        >
                          {atual?.data_validade ? fmtData(atual.data_validade) : STATUS_LABEL[status]}
                        </button>
                        {automatizavel && (
                          <button
                            onClick={() => emitirAutomatico(c, t.id)}
                            disabled={emitindo === chave}
                            className="text-yellow-600 hover:text-yellow-700 disabled:opacity-40"
                            title="Emitir automaticamente (Prefeitura de Feira de Santana)"
                          >
                            {emitindo === chave ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
            {clientesFiltrados.length === 0 && (
              <tr><td colSpan={TIPOS_CERTIDAO.length + 1} className="text-center py-8 text-gray-500">Nenhum cliente encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-800">{TIPOS_CERTIDAO.find((t) => t.id === modal.tipo)?.label}</h2>
                  <p className="text-sm text-gray-500">{modal.cliente.nome}</p>
                </div>
                <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>

              {modal.atual?.storage_path && (
                <button onClick={() => baixarAnexo(modal.atual)} className="flex items-center gap-1.5 text-xs text-blue-700 underline mb-2">
                  <FileText className="w-3.5 h-3.5" /> Ver certidão atual anexada
                </button>
              )}

              {!temAutomacao(modal.cliente, modal.tipo) && portalDeApoio(modal.cliente, modal.tipo) && (
                <button
                  onClick={() => abrirPortalOficial(modal.cliente, modal.tipo)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs bg-gray-50 border border-gray-200 text-gray-700 rounded-lg px-3 py-2 hover:bg-gray-100 mb-4"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Abrir portal oficial (CNPJ copiado)
                </button>
              )}

              <form onSubmit={salvar} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="form-label">Emissão</label>
                    <input type="date" className="input" value={form.data_emissao} onChange={(e) => setForm((f) => ({ ...f, data_emissao: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Validade *</label>
                    <input type="date" className="input" value={form.data_validade} onChange={(e) => setForm((f) => ({ ...f, data_validade: e.target.value }))} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Anexar PDF (opcional)</label>
                  <input type="file" accept="application/pdf,image/*" className="input" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Observações (opcional)</label>
                  <input className="input" value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={salvando} className="btn-primary flex-1 justify-center">
                    {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                  </button>
                  <button type="button" onClick={() => setModal(null)} className="btn-secondary">Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
