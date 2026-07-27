import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIdleLogout } from '../hooks/useIdleLogout'

const PortalAuthContext = createContext({})

const SECOES = ['honorarios', 'documentos', 'comunicacao', 'certidoes']
const MINUTOS_INATIVIDADE = 60

export function PortalAuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [contadores, setContadores] = useState({ honorarios: 0, documentos: 0, comunicacao: 0, certidoes: 0 })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchCliente(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchCliente(session.user.id)
      else { setCliente(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchCliente(userId) {
    const { data } = await supabase.from('clientes').select('*').eq('auth_user_id', userId).single()
    setCliente(data)
    setLoading(false)
    if (data?.id) fetchContadores(data.id)
  }

  // "Novo" = criado depois da última visita registrada naquela seção (ou
  // qualquer item, se o cliente nunca visitou a seção ainda).
  async function fetchContadores(clienteId) {
    const { data: leituras } = await supabase.from('portal_leituras').select('secao, visitado_em').eq('cliente_id', clienteId)
    const visitadoEm = Object.fromEntries((leituras || []).map(l => [l.secao, l.visitado_em]))

    const [cobrancasRes, notasRes, documentosRes, comunicacoesRes, chatRes, certidoesRes] = await Promise.all([
      contarNovos('cobrancas', clienteId, visitadoEm.honorarios),
      contarNovos('notas_fiscais', clienteId, visitadoEm.honorarios, { status: 'emitida' }),
      contarNovos('documentos_cliente', clienteId, visitadoEm.documentos, { origem: 'escritorio' }),
      contarNovos('comunicacoes', clienteId, visitadoEm.comunicacao),
      contarMensagensChatNovas(clienteId, visitadoEm.comunicacao),
      contarNovos('certidoes', clienteId, visitadoEm.certidoes),
    ])

    setContadores({
      honorarios: cobrancasRes + notasRes,
      documentos: documentosRes,
      comunicacao: comunicacoesRes + chatRes,
      certidoes: certidoesRes,
    })
  }

  // Mensagens de chat do escritório não têm cliente_id direto (ficam
  // dentro de chat_conversas) — busca as conversas do cliente primeiro.
  async function contarMensagensChatNovas(clienteId, desde) {
    const { data: conversas } = await supabase.from('chat_conversas').select('id').eq('cliente_id', clienteId)
    const ids = (conversas || []).map((c) => c.id)
    if (ids.length === 0) return 0
    let query = supabase.from('chat_mensagens').select('id', { count: 'exact', head: true }).eq('origem', 'escritorio').in('conversa_id', ids)
    if (desde) query = query.gt('created_at', desde)
    const { count } = await query
    return count || 0
  }

  async function contarNovos(tabela, clienteId, desde, filtrosExtras = {}) {
    let query = supabase.from(tabela).select('id', { count: 'exact', head: true }).eq('cliente_id', clienteId)
    Object.entries(filtrosExtras).forEach(([campo, valor]) => { query = query.eq(campo, valor) })
    if (desde) query = query.gt('created_at', desde)
    const { count } = await query
    return count || 0
  }

  async function marcarSecaoVisitada(secao) {
    if (!cliente?.id || !SECOES.includes(secao)) return
    setContadores(c => ({ ...c, [secao]: 0 }))
    await supabase.from('portal_leituras').upsert({ cliente_id: cliente.id, secao, visitado_em: new Date().toISOString() })
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function signOutPorInatividade() {
    await signOut()
    navigate('/portal/login')
  }

  useIdleLogout(!!user, MINUTOS_INATIVIDADE, signOutPorInatividade)

  return (
    <PortalAuthContext.Provider value={{ user, cliente, loading, signIn, signOut, contadores, marcarSecaoVisitada }}>
      {children}
    </PortalAuthContext.Provider>
  )
}

export const usePortalAuth = () => useContext(PortalAuthContext)
