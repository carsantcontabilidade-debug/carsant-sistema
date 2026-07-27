import { useEffect, useState } from 'react'
import { usePortalAuth } from '../../contexts/PortalAuthContext'
import { supabase } from '../../lib/supabase'
import { sanitizarNomeArquivo } from '../../lib/storage'
import { TIPOS_CERTIDAO, statusCertidao, STATUS_LABEL, STATUS_COR, certidoesAtuais, temAutomacao, portalDeApoio } from '../../lib/certidoes'
import { Loader2, Download, ShieldCheck, Upload, Zap, ExternalLink } from 'lucide-react'

function fmtData(d) {
  if (!d) return ''
  return d.split('-').reverse().join('/')
}

export default function PortalCertidoes() {
  const { cliente, user, marcarSecaoVisitada } = usePortalAuth()
  const [certidoes, setCertidoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [urls, setUrls] = useState({})
  const [modal, setModal] = useState(null) // { tipo }
  const [form, setForm] = useState({ data_validade: '' })
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [emitindo, setEmitindo] = useState(null) // tipo em andamento

  useEffect(() => { if (cliente?.id) { fetchCertidoes(); marcarSecaoVisitada('certidoes') } }, [cliente?.id])

  async function fetchCertidoes() {
    setLoading(true)
    const { data } = await supabase.from('certidoes').select('*').eq('cliente_id', cliente.id)
    setCertidoes(data || [])
    setLoading(false)
  }

  async function baixar(cert) {
    if (urls[cert.id]) { window.open(urls[cert.id], '_blank'); return }
    const { data, error } = await supabase.storage.from('certidoes').createSignedUrl(cert.storage_path, 300)
    if (error || !data) { alert('Não foi possível gerar o link de download.'); return }
    setUrls((prev) => ({ ...prev, [cert.id]: data.signedUrl }))
    window.open(data.signedUrl, '_blank')
  }

  function abrirCadastro(tipo) {
    setModal({ tipo })
    setForm({ data_validade: '' })
    setArquivo(null)
  }

  async function emitirAutomatico(tipo) {
    setEmitindo(tipo)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/certidao-emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tipo }),
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
      fetchCertidoes()
    } catch (err) {
      alert(`Erro ao emitir automaticamente: ${err.message}`)
    } finally {
      setEmitindo(null)
    }
  }

  async function abrirPortalOficial(tipo) {
    if (cliente?.cnpj) {
      try { await navigator.clipboard.writeText(cliente.cnpj.replace(/\D/g, '')) } catch { /* clipboard pode não estar disponível */ }
    }
    window.open(portalDeApoio(cliente, tipo), '_blank')
  }

  async function enviar(e) {
    e.preventDefault()
    if (!form.data_validade) { alert('Preencha a data de validade (está no documento).'); return }
    if (!arquivo) { alert('Anexe o arquivo da certidão.'); return }

    setEnviando(true)
    try {
      const path = `${cliente.id}/${modal.tipo}_cliente_${Date.now()}_${sanitizarNomeArquivo(arquivo.name)}`
      const { error: uploadError } = await supabase.storage.from('certidoes').upload(path, arquivo)
      if (uploadError) throw uploadError

      const { error } = await supabase.from('certidoes').insert({
        cliente_id: cliente.id,
        tipo: modal.tipo,
        data_validade: form.data_validade,
        storage_path: path,
        nome_arquivo: arquivo.name,
        registrado_por: user?.id,
      })
      if (error) throw error

      setModal(null)
      fetchCertidoes()
    } catch (err) {
      alert(`Não foi possível enviar: ${err.message}`)
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
  }

  const atuais = certidoesAtuais(certidoes)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Certidões Negativas</h1>
        <p className="text-sm text-gray-500 mt-1">Situação das certidões da sua empresa. Você também pode enviar uma certidão que já tenha em mãos.</p>
      </div>

      <div className="card">
        <div className="divide-y divide-gray-100">
          {TIPOS_CERTIDAO.map((t) => {
            const atual = atuais[t.id]
            const status = statusCertidao(atual?.data_validade)
            const automatizavel = cliente ? temAutomacao(cliente, t.id) : false
            const link = cliente ? portalDeApoio(cliente, t.id) : null
            return (
              <div key={t.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{t.label}</div>
                    {atual?.data_validade && <div className="text-xs text-gray-500">Válida até {fmtData(atual.data_validade)}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${STATUS_COR[status]}`}>{STATUS_LABEL[status]}</span>
                  {atual?.storage_path && (
                    <button onClick={() => baixar(atual)} className="btn-secondary btn-sm gap-1.5"><Download className="w-3.5 h-3.5" /> Baixar</button>
                  )}
                  {automatizavel && (
                    <button
                      onClick={() => emitirAutomatico(t.id)}
                      disabled={emitindo === t.id}
                      className="btn-secondary btn-sm gap-1.5 text-yellow-700 disabled:opacity-40"
                      title="Emitir automaticamente"
                    >
                      {emitindo === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Emitir agora
                    </button>
                  )}
                  {!automatizavel && link && (
                    <button onClick={() => abrirPortalOficial(t.id)} className="btn-secondary btn-sm gap-1.5" title="Abrir portal oficial (CNPJ copiado)">
                      <ExternalLink className="w-3.5 h-3.5" /> Portal oficial
                    </button>
                  )}
                  <button onClick={() => abrirCadastro(t.id)} className="btn-secondary btn-sm gap-1.5"><Upload className="w-3.5 h-3.5" /> Enviar</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">{TIPOS_CERTIDAO.find((t) => t.id === modal.tipo)?.label}</h2>
                <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <form onSubmit={enviar} className="space-y-3">
                <div className="form-group">
                  <label className="form-label">Validade *</label>
                  <input type="date" className="input" value={form.data_validade} onChange={(e) => setForm({ data_validade: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Arquivo (PDF) *</label>
                  <input type="file" accept="application/pdf,image/*" className="input" onChange={(e) => setArquivo(e.target.files?.[0] || null)} required />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={enviando} className="btn-primary flex-1 justify-center">
                    {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
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
