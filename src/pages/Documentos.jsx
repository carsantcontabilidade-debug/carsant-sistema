import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sanitizarNomeArquivo } from '../lib/storage'
import { Loader2, Upload, Download, FileText, Search } from 'lucide-react'

const CATEGORIAS = [
  { id: 'guia', label: 'Guia' },
  { id: 'folha_pagamento', label: 'Folha de pagamento' },
  { id: 'relatorio', label: 'Relatório' },
  { id: 'nota_fiscal', label: 'Nota fiscal' },
  { id: 'extrato', label: 'Extrato bancário' },
  { id: 'comprovante', label: 'Comprovante' },
  { id: 'outro', label: 'Outro' },
]

const CATEGORIA_LABEL = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.label]))

function fmtData(d) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Documentos() {
  const [clientes, setClientes] = useState([])
  const [busca, setBusca] = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState(null)
  const [documentos, setDocumentos] = useState([])
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [categoria, setCategoria] = useState('guia')
  const [mesReferencia, setMesReferencia] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [urls, setUrls] = useState({})

  useEffect(() => { carregarClientes() }, [])
  useEffect(() => { if (clienteSelecionado) carregarDocumentos() }, [clienteSelecionado?.id])

  async function carregarClientes() {
    setLoadingClientes(true)
    const { data } = await supabase.from('clientes').select('id, nome, regime').order('nome')
    setClientes(data || [])
    setLoadingClientes(false)
  }

  async function carregarDocumentos() {
    setLoadingDocs(true)
    const { data } = await supabase
      .from('documentos_cliente')
      .select('*')
      .eq('cliente_id', clienteSelecionado.id)
      .order('created_at', { ascending: false })
    setDocumentos(data || [])
    setLoadingDocs(false)
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
    if (!arquivo || !clienteSelecionado) return
    setEnviando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const path = `${clienteSelecionado.id}/${Date.now()}_${sanitizarNomeArquivo(arquivo.name)}`
      const { error: uploadError } = await supabase.storage.from('documentos-clientes').upload(path, arquivo)
      if (uploadError) throw uploadError

      const { error: insertError } = await supabase.from('documentos_cliente').insert({
        cliente_id: clienteSelecionado.id,
        categoria,
        origem: 'escritorio',
        nome_arquivo: arquivo.name,
        storage_path: path,
        mes_referencia: mesReferencia || null,
        enviado_por: user?.id,
      })
      if (insertError) throw insertError

      notificarCliente(clienteSelecionado.id, categoria)

      setArquivo(null)
      setMesReferencia('')
      carregarDocumentos()
    } catch (err) {
      alert(`Falha ao enviar o documento: ${err.message}`)
    } finally {
      setEnviando(false)
    }
  }

  // Falha ao notificar não deve impedir o upload — é só um aviso a mais.
  async function notificarCliente(clienteId, categoria) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/portal-notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          clienteId,
          title: 'Novo documento da CARSANT',
          body: `${CATEGORIA_LABEL[categoria] || categoria} disponível no Portal do Cliente.`,
          url: '/portal/documentos',
        }),
      })
    } catch {
      // silencioso — notificação é um extra, não deve travar o fluxo principal
    }
  }

  const clientesFiltrados = clientes.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      {/* Sidebar clientes */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-800 text-lg mb-3">📂 Documentos</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingClientes ? (
            <div className="p-4 text-sm text-gray-400 text-center">Carregando...</div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">Nenhum cliente encontrado</div>
          ) : (
            clientesFiltrados.map(c => (
              <button
                key={c.id}
                onClick={() => setClienteSelecionado(c)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${clienteSelecionado?.id === c.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'}`}
              >
                <div className="font-medium text-sm text-gray-800 truncate">{c.nome}</div>
                <div className="text-xs text-gray-400 mt-0.5">{c.regime}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Área principal */}
      <div className="flex-1 flex flex-col">
        {!clienteSelecionado ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Selecione um cliente para ver e enviar documentos
          </div>
        ) : (
          <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
            <h1 className="text-xl font-bold text-gray-900">{clienteSelecionado.nome}</h1>

            <div className="card">
              <div className="card-header"><h2 className="font-semibold text-gray-900">Enviar documento para o cliente</h2></div>
              <form onSubmit={enviar} className="p-4 flex flex-wrap items-end gap-3">
                <div className="form-group">
                  <label className="form-label">Categoria</label>
                  <select className="select" value={categoria} onChange={e => setCategoria(e.target.value)}>
                    {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Mês referência (opcional)</label>
                  <input className="input w-32" placeholder="2026-07" value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} />
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
              <div className="card-header"><h2 className="font-semibold text-gray-900">Documentos deste cliente</h2></div>
              {loadingDocs ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {documentos.map(d => (
                    <div key={d.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{d.nome_arquivo}</div>
                          <div className="text-xs text-gray-500">
                            {CATEGORIA_LABEL[d.categoria] || d.categoria}
                            {d.mes_referencia ? ` — ${d.mes_referencia}` : ''}
                            {' · '}
                            <span className={d.origem === 'cliente' ? 'text-blue-600' : 'text-gray-500'}>
                              {d.origem === 'cliente' ? 'Enviado pelo cliente' : 'Enviado pelo escritório'}
                            </span>
                            {' · '}{fmtData(d.created_at)}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => baixar(d)} className="btn-secondary btn-sm gap-1.5"><Download className="w-3.5 h-3.5" /> Baixar</button>
                    </div>
                  ))}
                  {documentos.length === 0 && <div className="text-center py-8 text-gray-500">Nenhum documento ainda</div>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
