import { createContext, useContext, useEffect, useState } from 'react'
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

  useEffect(() => {
    // Verifica sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Escuta mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        // loading precisa voltar pra true aqui: sem isso, há uma janela entre
        // "user" já preenchido e "profile" ainda não buscado em que o
        // PrivateRoute lê profile=null (valor antigo) e manda pro Portal do
        // Cliente por engano, mesmo sendo um login de gestor/colaborador.
        setLoading(true)
        fetchProfile(session.user.id)
      } else { setProfile(null); setLoading(false) }
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
