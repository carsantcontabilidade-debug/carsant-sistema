import { useEffect, useState } from 'react'
import { usePortalAuth } from '../../contexts/PortalAuthContext'
import { supabase } from '../../lib/supabase'
import { Loader2, MessageCircle, Mail, Phone, Users } from 'lucide-react'

const CANAL_ICONE = {
  whatsapp: MessageCircle,
  email: Mail,
  telefone: Phone,
  presencial: Users,
}

function fmtData(d) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PortalComunicacao() {
  const { cliente, marcarSecaoVisitada } = usePortalAuth()
  const [comunicacoes, setComunicacoes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (cliente?.id) { fetchComunicacoes(); marcarSecaoVisitada('comunicacao') } }, [cliente?.id])

  async function fetchComunicacoes() {
    setLoading(true)
    const { data } = await supabase
      .from('comunicacoes')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('created_at', { ascending: false })
    setComunicacoes(data || [])
    setLoading(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Comunicação</h1>
        <p className="text-sm text-gray-500 mt-1">Histórico de mensagens trocadas com o escritório.</p>
      </div>

      <div className="card">
        <div className="divide-y divide-gray-100">
          {comunicacoes.map(c => {
            const Icon = CANAL_ICONE[c.canal] || MessageCircle
            return (
              <div key={c.id} className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-900">{c.assunto || 'Comunicação'}</span>
                  <span className="text-xs text-gray-400 ml-auto">{fmtData(c.created_at)}</span>
                </div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{c.mensagem}</p>
              </div>
            )
          })}
          {comunicacoes.length === 0 && (
            <div className="text-center py-10 text-gray-500">Nenhuma comunicação registrada ainda</div>
          )}
        </div>
      </div>
    </div>
  )
}
