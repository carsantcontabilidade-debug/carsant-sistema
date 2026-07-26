import { useEffect, useRef, useState } from 'react'
import { usePortalAuth } from '../../contexts/PortalAuthContext'
import { supabase } from '../../lib/supabase'
import { sanitizarNomeArquivo } from '../../lib/storage'
import { ASSUNTOS_CHAT } from '../../lib/chat'
import { Loader2, Send, Paperclip, FileText, Plus, ArrowLeft } from 'lucide-react'

function fmtHora(d) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function PortalComunicacao() {
  const { cliente, user, marcarSecaoVisitada } = usePortalAuth()
  const [conversas, setConversas] = useState([])
  const [loading, setLoading] = useState(true)
  const [conversaAtual, setConversaAtual] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [novaAberta, setNovaAberta] = useState(false)
  const [assuntoEscolhido, setAssuntoEscolhido] = useState(ASSUNTOS_CHAT[0].id)
  const [mensagemInicial, setMensagemInicial] = useState('')
  const [criando, setCriando] = useState(false)
  const fimRef = useRef(null)

  useEffect(() => { if (cliente?.id) { fetchConversas(); marcarSecaoVisitada('comunicacao') } }, [cliente?.id])

  useEffect(() => {
    if (!conversaAtual?.id) return
    fetchMensagens(conversaAtual.id)

    const channel = supabase
      .channel(`chat_mensagens_${conversaAtual.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensagens', filter: `conversa_id=eq.${conversaAtual.id}` }, (payload) => {
        setMensagens((atual) => atual.some((m) => m.id === payload.new.id) ? atual : [...atual, payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversaAtual?.id])

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens])

  async function fetchConversas() {
    setLoading(true)
    const { data } = await supabase
      .from('chat_conversas')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('updated_at', { ascending: false })
    setConversas(data || [])
    setLoading(false)
  }

  async function fetchMensagens(conversaId) {
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('chat_mensagens')
      .select('*')
      .eq('conversa_id', conversaId)
      .order('created_at', { ascending: true })
    setMensagens(data || [])
    setLoadingMsgs(false)
  }

  async function criarConversa(e) {
    e.preventDefault()
    if (!mensagemInicial.trim()) return
    setCriando(true)
    try {
      const assunto = ASSUNTOS_CHAT.find((a) => a.id === assuntoEscolhido)
      const { data: conversa, error } = await supabase
        .from('chat_conversas')
        .insert({ cliente_id: cliente.id, assunto: assunto.label, setor: assunto.setor })
        .select()
        .single()
      if (error) throw error

      const { error: msgError } = await supabase.from('chat_mensagens').insert({
        conversa_id: conversa.id,
        origem: 'cliente',
        autor_id: user.id,
        autor_nome: cliente.nome,
        mensagem: mensagemInicial.trim(),
      })
      if (msgError) throw msgError

      avisarEquipe(conversa.id)

      setNovaAberta(false)
      setMensagemInicial('')
      await fetchConversas()
      setConversaAtual(conversa)
    } catch (err) {
      alert(`Não foi possível iniciar a conversa: ${err.message}`)
    } finally {
      setCriando(false)
    }
  }

  async function enviarMensagem(e) {
    e.preventDefault()
    if (!conversaAtual || (!texto.trim() && !arquivo)) return
    setEnviando(true)
    try {
      let anexo_nome = null
      let anexo_path = null
      if (arquivo) {
        const path = `${conversaAtual.id}/${Date.now()}_${sanitizarNomeArquivo(arquivo.name)}`
        const { error: uploadError } = await supabase.storage.from('chat-anexos').upload(path, arquivo)
        if (uploadError) throw uploadError
        anexo_nome = arquivo.name
        anexo_path = path
      }

      const { error } = await supabase.from('chat_mensagens').insert({
        conversa_id: conversaAtual.id,
        origem: 'cliente',
        autor_id: user.id,
        autor_nome: cliente.nome,
        mensagem: texto.trim() || null,
        anexo_nome,
        anexo_path,
      })
      if (error) throw error

      avisarEquipe(conversaAtual.id)

      setTexto('')
      setArquivo(null)
      fetchMensagens(conversaAtual.id)
    } catch (err) {
      alert(`Não foi possível enviar a mensagem: ${err.message}`)
    } finally {
      setEnviando(false)
    }
  }

  // Falha ao avisar não deve travar o envio da mensagem — é só um extra.
  async function avisarEquipe(conversaId) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/chat-avisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ conversaId }),
      })
    } catch {
      // silencioso
    }
  }

  async function baixarAnexo(msg) {
    const { data, error } = await supabase.storage.from('chat-anexos').createSignedUrl(msg.anexo_path, 300)
    if (error || !data) { alert('Não foi possível abrir o anexo.'); return }
    window.open(data.signedUrl, '_blank')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comunicação</h1>
          <p className="text-sm text-gray-500 mt-1">Converse diretamente com o setor responsável do escritório.</p>
        </div>
        {!conversaAtual && (
          <button onClick={() => setNovaAberta(true)} className="btn-primary gap-1.5">
            <Plus className="w-4 h-4" /> Nova conversa
          </button>
        )}
      </div>

      {novaAberta && (
        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-gray-900">Iniciar nova conversa</h2></div>
          <form onSubmit={criarConversa} className="p-4 space-y-3">
            <div className="form-group">
              <label className="form-label">Assunto</label>
              <select className="select" value={assuntoEscolhido} onChange={(e) => setAssuntoEscolhido(e.target.value)}>
                {ASSUNTOS_CHAT.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Mensagem</label>
              <textarea className="input" rows={3} value={mensagemInicial} onChange={(e) => setMensagemInicial(e.target.value)} placeholder="Descreva o que você precisa..." />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={criando || !mensagemInicial.trim()} className="btn-primary">
                {criando ? 'Enviando...' : 'Iniciar conversa'}
              </button>
              <button type="button" onClick={() => setNovaAberta(false)} className="btn-secondary">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {conversaAtual ? (
        <div className="card flex flex-col h-[32rem]">
          <div className="card-header flex items-center gap-3">
            <button onClick={() => setConversaAtual(null)} className="btn-ghost p-1.5"><ArrowLeft className="w-4 h-4" /></button>
            <div>
              <h2 className="font-semibold text-gray-900">{conversaAtual.assunto}</h2>
              <p className="text-xs text-gray-500">{conversaAtual.status === 'encerrada' ? 'Conversa encerrada' : 'Em andamento'}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {loadingMsgs ? (
              <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
            ) : (
              mensagens.map((m) => (
                <div key={m.id} className={`flex ${m.origem === 'cliente' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${m.origem === 'cliente' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
                    {m.origem !== 'cliente' && m.autor_nome && <div className="text-xs font-medium mb-0.5 opacity-70">{m.autor_nome}</div>}
                    {m.mensagem && <p className="whitespace-pre-wrap">{m.mensagem}</p>}
                    {m.anexo_path && (
                      <button onClick={() => baixarAnexo(m)} className={`mt-1.5 flex items-center gap-1.5 text-xs underline ${m.origem === 'cliente' ? 'text-white' : 'text-brand-700'}`}>
                        <FileText className="w-3.5 h-3.5" /> {m.anexo_nome}
                      </button>
                    )}
                    <div className={`text-[10px] mt-1 ${m.origem === 'cliente' ? 'text-white/70' : 'text-gray-400'}`}>{fmtHora(m.created_at)}</div>
                  </div>
                </div>
              ))
            )}
            <div ref={fimRef} />
          </div>

          <form onSubmit={enviarMensagem} className="p-3 border-t border-gray-100 flex items-end gap-2">
            <label className="btn-ghost p-2.5 cursor-pointer">
              <Paperclip className="w-4 h-4" />
              <input type="file" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
            </label>
            <textarea
              className="input flex-1 resize-none"
              rows={1}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={arquivo ? `Anexo: ${arquivo.name}` : 'Digite sua mensagem...'}
            />
            <button type="submit" disabled={enviando || (!texto.trim() && !arquivo)} className="btn-primary p-2.5">
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      ) : (
        <div className="card">
          <div className="divide-y divide-gray-100">
            {conversas.map((c) => (
              <button key={c.id} onClick={() => setConversaAtual(c)} className="w-full text-left p-4 hover:bg-gray-50 flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{c.assunto}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{fmtHora(c.updated_at)}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.status === 'encerrada' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                  {c.status === 'encerrada' ? 'Encerrada' : 'Em andamento'}
                </span>
              </button>
            ))}
            {conversas.length === 0 && !novaAberta && (
              <div className="text-center py-10 text-gray-500">Nenhuma conversa ainda — clique em "Nova conversa" para falar com a gente.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
