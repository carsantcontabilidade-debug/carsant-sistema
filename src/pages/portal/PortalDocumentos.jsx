import { useEffect, useState } from 'react'
import { usePortalAuth } from '../../contexts/PortalAuthContext'
import { supabase } from '../../lib/supabase'
import { Loader2, Upload, Download, FileText } from 'lucide-react'

const CATEGORIAS_ENVIO = [
  { id: 'nota_fiscal', label: 'Nota fiscal' },
  { id: 'extrato', label: 'Extrato bancário' },
  { id: 'comprovante', label: 'Comprovante' },
  { id: 'outro', label: 'Outro' },
]

const CATEGORIA_LABEL = {
  nota_fiscal: 'Nota fiscal',
  extrato: 'Extrato bancário',
  comprovante: 'Comprovante',
  guia: 'Guia',
  folha_pagamento: 'Folha de pagamento',
  relatorio: 'Relatório',
  outro: 'Outro',
}

export default function PortalDocumentos() {
  const { cliente } = usePortalAuth()
  const [documentos, setDocumentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoria, setCategoria] = useState('nota_fiscal')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [urls, setUrls] = useState({})

  useEffect(() => { if (cliente?.id) fetchDocumentos() }, [cliente?.id])

  async function fetchDocumentos() {
    setLoading(true)
    const { data } = await supabase
      .from('documentos_cliente')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('created_at', { ascending: false })
    setDocumentos(data || [])
    setLoading(false)
  }

  async function baixar(doc) {
    if (urls[doc.id]) {
      window.open(urls[doc.id], '_blank')
      return
    }
    const { data, error } = await supabase.storage.from('documentos-clientes').createSignedUrl(doc.storage_path, 300)
    if (error || !data) {
      alert('Não foi possível gerar o link de download.')
      return
    }
    setUrls(prev => ({ ...prev, [doc.id]: data.signedUrl }))
    window.open(data.signedUrl, '_blank')
  }

  async function enviar(e) {
    e.preventDefault()
    if (!arquivo) return
    setEnviando(true)
    try {
      // Supabase Storage não aceita espaços/acentos na chave do arquivo —
      // sanitiza para o path, mas guarda o nome original em nome_arquivo.
      const nomeSanitizado = arquivo.name
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${cliente.id}/${Date.now()}_${nomeSanitizado}`
      const { error: uploadError } = await supabase.storage.from('documentos-clientes').upload(path, arquivo)
      if (uploadError) throw uploadError

      const { error: insertError } = await supabase.from('documentos_cliente').insert({
        cliente_id: cliente.id,
        categoria,
        origem: 'cliente',
        nome_arquivo: arquivo.name,
        storage_path: path,
      })
      if (insertError) throw insertError

      setArquivo(null)
      fetchDocumentos()
    } catch (err) {
      alert(`Falha ao enviar o documento: ${err.message}`)
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
  }

  const recebidos = documentos.filter(d => d.origem === 'escritorio')
  const enviados = documentos.filter(d => d.origem === 'cliente')

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
        <p className="text-sm text-gray-500 mt-1">Envie seus documentos e baixe guias, folha de pagamento e relatórios enviados pelo escritório.</p>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Enviar documento</h2></div>
        <form onSubmit={enviar} className="p-4 flex flex-wrap items-end gap-3">
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="select" value={categoria} onChange={e => setCategoria(e.target.value)}>
              {CATEGORIAS_ENVIO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group flex-1 min-w-48">
            <label className="form-label">Arquivo</label>
            <input type="file" className="input" onChange={e => setArquivo(e.target.files?.[0] || null)} />
          </div>
          <button type="submit" disabled={!arquivo || enviando} className="btn-primary gap-1.5">
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {enviando ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Recebidos do escritório</h2></div>
        <div className="divide-y divide-gray-100">
          {recebidos.map(d => (
            <div key={d.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{d.nome_arquivo}</div>
                  <div className="text-xs text-gray-500">{CATEGORIA_LABEL[d.categoria] || d.categoria}{d.mes_referencia ? ` — ${d.mes_referencia}` : ''}</div>
                </div>
              </div>
              <button onClick={() => baixar(d)} className="btn-secondary btn-sm gap-1.5"><Download className="w-3.5 h-3.5" /> Baixar</button>
            </div>
          ))}
          {recebidos.length === 0 && <div className="text-center py-8 text-gray-500">Nada recebido ainda</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Enviados por você</h2></div>
        <div className="divide-y divide-gray-100">
          {enviados.map(d => (
            <div key={d.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{d.nome_arquivo}</div>
                  <div className="text-xs text-gray-500">{CATEGORIA_LABEL[d.categoria] || d.categoria}</div>
                </div>
              </div>
              <button onClick={() => baixar(d)} className="btn-secondary btn-sm gap-1.5"><Download className="w-3.5 h-3.5" /> Ver</button>
            </div>
          ))}
          {enviados.length === 0 && <div className="text-center py-8 text-gray-500">Você ainda não enviou nada</div>}
        </div>
      </div>
    </div>
  )
}
