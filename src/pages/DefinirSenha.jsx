import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

// Mesmo padrão de src/pages/portal/PortalDefinirSenha.jsx (token_hash/type
// verificados só no submit, nunca ao carregar a página) — aqui para contas
// de equipe (staff), criadas em Configurações → Cadastro de usuários.
export default function DefinirSenha() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirmar) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)

    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    if (tokenHash && type) {
      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      if (verifyError) {
        setLoading(false)
        setError('Este link expirou ou já foi usado. Peça um novo convite ao gestor.')
        return
      }
    }

    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError('Não foi possível definir a senha. Peça um novo convite ao gestor.')
      return
    }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-48">
            <img src="/logo.png" alt="CARSANT Contabilidade" className="w-full rounded-2xl shadow-2xl" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Defina sua senha</h2>
          <p className="text-sm text-gray-500 mb-6">Esta será a senha usada para acessar o sistema daqui em diante.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="form-label">Nova senha</label>
              <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar senha</label>
              <input type="password" className="input" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Salvando...' : 'Salvar e entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
