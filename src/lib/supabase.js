import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Variáveis do Supabase não encontradas. Verifique o arquivo .env')
}

// sessionStorage em vez do localStorage padrão do Supabase — a sessão
// morre quando o navegador é fechado de verdade (não só a aba), em vez
// de continuar logado indefinidamente. Vale tanto pro sistema interno
// quanto pro Portal do Cliente, que usam este mesmo client.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
})
