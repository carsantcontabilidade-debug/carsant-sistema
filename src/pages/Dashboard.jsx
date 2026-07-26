import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  CheckSquare, Users, Calendar, ArrowRight, Loader2, MessageCircle
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Dashboard() {
  const { profile, isGestor } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const hoje = new Date()
  const mesAtual = hoje.getMonth()
  const anoAtual = hoje.getFullYear()

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    setLoading(true)
    const [clientes, despesas, tarefas, atendimentos, eventos, pagamentos, conversas] = await Promise.all([
      supabase.from('clientes').select('*'),
      supabase.from('despesas').select('*'),
      supabase.from('tarefas').select('*'),
      supabase.from('atendimentos').select('*').order('data', { ascending: false }).limit(5),
      supabase.from('eventos').select('*').gte('data', format(hoje, 'yyyy-MM-dd')).order('data').limit(5),
      supabase.from('pagamentos_honorarios').select('*').eq('mes', mesAtual).eq('ano', anoAtual),
      supabase.from('chat_conversas').select('id, assunto, updated_at, ultimo_origem, staff_lido_em, clientes(nome)').eq('status', 'aberta'),
    ])
    setData({
      clientes: clientes.data || [],
      despesas: despesas.data || [],
      tarefas: tarefas.data || [],
      atendimentos: atendimentos.data || [],
      eventos: eventos.data || [],
      pagamentos: pagamentos.data || [],
      conversas: conversas.data || [],
    })
    setLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
    </div>
  )

  const { clientes, despesas, tarefas, atendimentos, eventos, pagamentos, conversas } = data
  const hoje7 = new Date(); hoje7.setDate(hoje7.getDate() + 7)
  const hojeStr = format(hoje, 'yyyy-MM-dd')
  const hoje7Str = format(hoje7, 'yyyy-MM-dd')

  const conversasNaoLidas = conversas.filter(
    (c) => c.ultimo_origem === 'cliente' && (!c.staff_lido_em || new Date(c.staff_lido_em) < new Date(c.updated_at))
  )

  // KPIs
  const totalHonorarios = clientes.reduce((s, c) => s + (c.valor_honorario || 0), 0)
  const inadimplentes = clientes.filter(c => {
    if (!(c.valor_honorario > 0)) return false
    const pago = pagamentos.find(p => p.cliente_id === c.id)?.pago
    if (pago) return false
    const venc = new Date(anoAtual, mesAtual, c.dia_vencimento || 10)
    return hoje > venc
  })
  const tarefasAtrasadas = tarefas.filter(t => t.status === 'atrasada')
  const tarefasMinhas = isGestor ? tarefas : tarefas.filter(t => t.responsavel === profile?.nome)
  const eventosProximos = eventos.filter(e => e.data >= hojeStr && e.data <= hoje7Str)

  const totalDespesas = despesas.filter(d => d.recorrencia === 'mensal').reduce((s, d) => s + (d.valor || 0), 0)
  const saldo = totalHonorarios - totalDespesas

  const statusColor = { pago: 'badge-green', pendente: 'badge-yellow', atraso: 'badge-red', concluida: 'badge-green', andamento: 'badge-blue', atrasada: 'badge-red' }
  const statusLabel = { pago: 'Pago', pendente: 'Pendente', atraso: 'Em atraso', concluida: 'Concluída', andamento: 'Andamento', atrasada: 'Atrasada' }
  const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0 })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Saudação */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Bom dia, {profile?.nome?.split(' ')[0] || 'usuário'} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {format(hoje, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* Comunicação — prioridade máxima, primeiro alerta visto ao entrar */}
      {conversasNaoLidas.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            <MessageCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              {conversasNaoLidas.length} nova{conversasNaoLidas.length > 1 ? 's' : ''} mensagem{conversasNaoLidas.length > 1 ? 'ns' : ''} no chat
              {conversasNaoLidas.length === 1 && conversasNaoLidas[0].clientes?.nome ? ` — ${conversasNaoLidas[0].clientes.nome}` : ''}
            </span>
            <button
              onClick={() => navigate(conversasNaoLidas.length === 1 ? `/comunicacao?conversa=${conversasNaoLidas[0].id}` : '/comunicacao')}
              className="ml-auto text-blue-700 hover:text-blue-900 font-medium flex items-center gap-1"
            >
              Ver <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Alertas */}
      {(tarefasAtrasadas.length > 0 || inadimplentes.length > 0) && (
        <div className="space-y-2 mb-6">
          {tarefasAtrasadas.length > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{tarefasAtrasadas.length} tarefa{tarefasAtrasadas.length > 1 ? 's' : ''} em atraso</span>
              <button onClick={() => navigate('/tarefas')} className="ml-auto text-red-600 hover:text-red-800 font-medium flex items-center gap-1">
                Ver <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
          {inadimplentes.length > 0 && (
            <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{inadimplentes.length} cliente{inadimplentes.length > 1 ? 's' : ''} com honorário em atraso</span>
              <button onClick={() => navigate('/honorarios')} className="ml-auto text-yellow-700 hover:text-yellow-900 font-medium flex items-center gap-1">
                Ver <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Saldo */}
      <div className={`rounded-2xl p-6 mb-6 flex items-center justify-between ${saldo >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div>
          <p className="text-sm font-medium text-gray-600">Saldo do mês — {format(hoje, 'MMMM/yyyy', { locale: ptBR })}</p>
          <p className="text-xs text-gray-500 mt-0.5">Honorários ({fmt(totalHonorarios)}) − Despesas ({fmt(totalDespesas)})</p>
        </div>
        <div className={`text-3xl font-bold flex items-center gap-2 ${saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          {saldo >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
          {saldo < 0 ? '-' : ''}{fmt(Math.abs(saldo))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/honorarios')}>
          <div className="stat-label">Total honorários/mês</div>
          <div className="stat-value text-brand-700">{fmt(totalHonorarios)}</div>
          <div className="stat-sub">{clientes.length} clientes</div>
        </div>
        <div className="stat-card cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/honorarios')}>
          <div className="stat-label">Em atraso</div>
          <div className="stat-value text-red-600">{inadimplentes.length}</div>
          <div className="stat-sub">clientes inadimplentes</div>
        </div>
        <div className="stat-card cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/tarefas')}>
          <div className="stat-label">Tarefas atrasadas</div>
          <div className="stat-value text-red-600">{tarefasAtrasadas.length}</div>
          <div className="stat-sub">de {tarefasMinhas.filter(t => t.status !== 'concluida').length} em aberto</div>
        </div>
        <div className="stat-card cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/agenda')}>
          <div className="stat-label">Eventos próximos</div>
          <div className="stat-value text-brand-700">{eventosProximos.length}</div>
          <div className="stat-sub">nos próximos 7 dias</div>
        </div>
      </div>

      {/* Linha inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tarefas recentes */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-gray-900">
              <CheckSquare className="w-4 h-4 text-brand-600" />Tarefas em aberto
            </div>
            <button onClick={() => navigate('/tarefas')} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              Ver todas <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {tarefasMinhas.filter(t => t.status !== 'concluida').slice(0, 5).map(t => (
              <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.descricao}</p>
                  {t.cliente_nome && <p className="text-xs text-gray-500 truncate">{t.cliente_nome}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.prazo && <span className="text-xs text-gray-500">{t.prazo.split('-').reverse().join('/')}</span>}
                  <span className={statusColor[t.status] || 'badge-gray'}>{statusLabel[t.status] || t.status}</span>
                </div>
              </div>
            ))}
            {tarefasMinhas.filter(t => t.status !== 'concluida').length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-500">Nenhuma tarefa em aberto ✓</div>
            )}
          </div>
        </div>

        {/* Próximos eventos */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-gray-900">
              <Calendar className="w-4 h-4 text-brand-600" />Próximos eventos
            </div>
            <button onClick={() => navigate('/agenda')} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              Ver agenda <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {eventos.slice(0, 5).map(e => {
              const corMap = { reuniao: 'bg-blue-100 text-blue-700', prazo: 'bg-red-100 text-red-700', visita: 'bg-yellow-100 text-yellow-700', outro: 'bg-gray-100 text-gray-600' }
              return (
                <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${corMap[e.tipo] || corMap.outro}`}>
                    {{ reuniao: 'Reunião', prazo: 'Prazo', visita: 'Visita', outro: 'Outro' }[e.tipo]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{e.titulo}</p>
                    {e.cliente_nome && <p className="text-xs text-gray-500 truncate">{e.cliente_nome}</p>}
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {e.data.split('-').reverse().join('/')}{e.hora ? ' ' + e.hora : ''}
                  </span>
                </div>
              )
            })}
            {eventos.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-500">Nenhum evento próximo</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
