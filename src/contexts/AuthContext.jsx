import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIdleLogout, registrarLoginComoAtividade } from '../hooks/useIdleLogout'

const AuthContext = createContext({})

const MINUTOS_INATIVIDADE = 60

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Id do usuário já tratado. O Supabase reenvia "SIGNED_IN" com a MESMA
  // sessão toda vez que a aba volta a ficar visível (hidden -> visible, em
  // _recoverAndRefresh). Tratar isso como um login novo ligava o "Carregando"
  // do PrivateRoute, que desmonta a página inteira — e tudo que não estava
  // salvo (cliente selecionado, filtros, busca...) se perdia a cada troca de
  // aba, em qualquer tela (relatado pelo Ronaldo em 2026-10-08).
  const usuarioAtualRef = useRef(null)

  useEffect(() => {
    function aplicarSessao(session) {
      const novoId = session?.user?.id ?? null
      if (novoId === usuarioAtualRef.current) return
      usuarioAtualRef.current = novoId
      setUser(session?.user ?? null)
      if (novoId) {
        // loading precisa voltar pra true aqui: sem isso, há uma janela entre
        // "user" já preenchido e "profile" ainda não buscado em que o
        // PrivateRoute lê profile=null (valor antigo) e manda pro Portal do
        // Cliente por engano, mesmo sendo um login de gestor/colaborador.
        setLoading(true)
        fetchProfile(novoId)
      } else {
        setProfile(null)
        setLoading(false)
      }
    }

    // Verifica sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) aplicarSessao(session)
      else setLoading(false)
    })

    // Escuta mudanças de auth (login, logout, outro usuário)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      aplicarSessao(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId, tentativa = 0) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    // Falha transitória (ex.: rede ainda subindo quando a aba acorda de ter
    // sido descartada em segundo plano pelo navegador) não pode virar
    // "profile = null" direto — o GestorRoute lê isso como "não é gestor" e
    // manda até o próprio Ronaldo de volta pro Dashboard sem aviso nenhum
    // (relatado em 2026-09-21, depois de voltar de uma aba do WhatsApp).
    // Tenta mais uma vez antes de desistir de verdade.
    if (error && tentativa === 0) {
      await new Promise((r) => setTimeout(r, 1000))
      return fetchProfile(userId, tentativa + 1)
    }
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // Sem isto, um "última atividade" antigo (de horas atrás, mesma aba)
    // podia fazer o login recém-feito ser deslogado na hora pelo
    // useIdleLogout, sem nenhuma mensagem de erro visível.
    if (!error) registrarLoginComoAtividade()
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function signOutPorInatividade() {
    await signOut()
    navigate('/login')
  }

  useIdleLogout(!!user, MINUTOS_INATIVIDADE, signOutPorInatividade)

  const isGestor = profile?.role === 'gestor'

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, isGestor }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
