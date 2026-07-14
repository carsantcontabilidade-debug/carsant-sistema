import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const PortalAuthContext = createContext({})

export function PortalAuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)

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
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <PortalAuthContext.Provider value={{ user, cliente, loading, signIn, signOut }}>
      {children}
    </PortalAuthContext.Provider>
  )
}

export const usePortalAuth = () => useContext(PortalAuthContext)
