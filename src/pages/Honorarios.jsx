import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CheckCircle, RefreshCw, Search, Filter, Loader2, TrendingUp, AlertCircle, Clock, Trash2, Ban } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const MES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function Honorarios() {
  const hoje = new Date()
  const [mesAtivo, setMesAtivo] = useState(hoje.getMonth())
  const [anoAtivo, setAnoAtivo] = useState(hoje.getFullYear())
  const [clientes, setClientes] = useState([])
  const [pagamentos, setPagamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [ocultarIsentos, setOcultarIsentos] = useState(false)

  useEffect(() => { fetchDados() }, [mesAtivo, anoAtivo])

  async function fetchDados() {
    setLoading(true)
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('clientes').select('*').gt('valor_honorario', 0).order('nome'),
      supabase.from('pagamentos_honorarios').select('*').eq('mes', mesAtivo).eq('ano', anoAtivo)
    ])
    setClientes(c || [])
    setPagamentos(p || [])
    setLoading(false)
  }

  function statusCliente(c) {
    const registro = pagamentos.find(p => p.cliente_id === c.id)
    if (registro?.isento) return 'isento'
    if (registro?.pago) return 'pago'
    const venc = new Date(anoAtivo, mesAtivo, c.dia_vencimento || 10)
    return hoje > venc ? 'atraso' : 'pendente'
  }

  async function marcarPago(clienteId) {
    const existente = pagamentos.find(p => p.cliente_id === clienteId)
    if (existente) {
      await supabase.from('pagamentos_honorarios').update({ pago: true, data_pagamento: format(hoje, 'yyyy-MM-dd') }).eq('id', existente.id)
    } else {
      await supabase.from('pagamentos_honorarios').insert({ cliente_id: clienteId, mes: mesAtivo, ano: anoAtivo, pago: true, data_pagamento: format(hoje, 'yyyy-MM-dd') })
    }
    fetchDados()
  }

  async function desmarcarPago(clienteId) {
    const existente = pagamentos.find(p => p.cliente_id === clienteId)
    if (existente) await supabase.from('pagamentos_honorarios').update({ pago: false, data_pagamento: null }).eq('id', existente.id)
    fetchDados()
  }

  // Isentar = "esse mês não se aplica" pra esse cliente (férias, pausa,
  // erro de cobrança) — diferente de pago, não conta em nenhum total.
  async function marcarIsento(clienteId) {
    const existente = pagamentos.find(p => p.cliente_id === clienteId)
    if (existente) {
      await supabase.from('pagamentos_honorarios').update({ isento: true, pago: false, data_pagamento: null }).eq('id', existente.id)
    } else {
      await supabase.from('pagamentos_honorarios').insert({ cliente_id: clienteId, mes: mesAtivo, ano: anoAtivo, isento: true })
    }
    fetchDados()
  }

  function registroExistente(clienteId) {
    return pagamentos.find(p => p.cliente_id === clienteId)
  }

  async function excluirRegistro(clienteId) {
    const existente = registroExistente(clienteId)
    if (!existente) return
    if (!window.confirm('Excluir o registro deste mês para este cliente (pago ou isenção)? O status volta a ser calculado normalmente (pendente/atraso).')) return
    await supabase.from('pagamentos_honorarios').delete().eq('id', existente.id)
    fetchDados()
  }

  // Meses para o seletor
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    return { mes: d.getMonth(), ano: d.getFullYear(), label: `${MES_NOMES[d.getMonth()]} ${d.getFullYear()}` }
  })

  const filtrados = clientes.filter(c => {
    const st = statusCliente(c)
    if (ocultarIsentos && st === 'isento') return false
    return c.nome.toLowerCase().includes(busca.toLowerCase()) && (!filtroStatus || st === filtroStatus)
  })

  // Isentos não entram em nenhum total do mês (não são cobrança esperada).
  const clientesCobraveis = clientes.filter(c => statusCliente(c) !== 'isento')
  const totalMes = clientesCobraveis.reduce((s, c) => s + (c.valor_honorario || 0), 0)
  const recebido = clientesCobraveis.filter(c => statusCliente(c) === 'pago').reduce((s, c) => s + (c.valor_honorario || 0), 0)
  const emAtraso = clientesCobraveis.filter(c => statusCliente(c) === 'atraso').reduce((s, c) => s + (c.valor_honorario || 0), 0)
  const pendente = clientesCobraveis.filter(c => statusCliente(c) === 'pendente').reduce((s, c) => s + (c.valor_honorario || 0), 0)
  const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Honorários</h1>
          <p className="text-sm text-gray-500 mt-1">Controle de recebimentos mensais</p>
        </div>
        <select className="select w-auto" value={`${mesAtivo}_${anoAtivo}`} onChange={e => {
          const [m, a] = e.target.value.split('_')
          setMesAtivo(parseInt(m)); setAnoAtivo(parseInt(a))
        }}>
          {meses.map(m => <option key={`${m.mes}_${m.ano}`} value={`${m.mes}_${m.ano}`}>{m.label}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <div className="stat-label">Total do mês</div>
          <div className="stat-value text-gray-900">{fmt(totalMes)}</div>
          <div className="stat-sub">{clientesCobraveis.length} clientes</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Recebido</div>
          <div className="stat-value text-green-600">{fmt(recebido)}</div>
          <div className="stat-sub">{totalMes > 0 ? Math.round(recebido / totalMes * 100) : 0}% do total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><AlertCircle className="w-3 h-3 text-red-500" /> Em atraso</div>
          <div className="stat-value text-red-600">{fmt(emAtraso)}</div>
          <div className="stat-sub">{clientes.filter(c => statusCliente(c) === 'atraso').length} clientes</div>
        </div>
        <div className="stat-card">
          <div className="stat-label flex items-center gap-1"><Clock className="w-3 h-3 text-yellow-500" /> Pendente</div>
          <div className="stat-value text-yellow-600">{fmt(pendente)}</div>
          <div className="stat-sub">{clientes.filter(c => statusCliente(c) === 'pendente').length} clientes</div>
        </div>
      </div>

      {/* Barra de progresso */}
      {totalMes > 0 && (
        <div className="card p-4 mb-5">
          <div className="flex justify-between text-xs text-gray-600 mb-2">
            <span>Recebimento do mês</span>
            <span className="font-semibold">{Math.round(recebido / totalMes * 100)}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${Math.round(recebido / totalMes * 100)}%` }} />
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="select w-auto" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="pago">Pagos</option>
          <option value="pendente">Pendentes</option>
          <option value="atraso">Em atraso</option>
          <option value="isento">Isentos</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 px-1">
          <input type="checkbox" className="accent-brand-600" checked={ocultarIsentos} onChange={e => setOcultarIsentos(e.target.checked)} />
          Ocultar isentos
        </label>
      </div>

      {/* Tabela */}
      <div className="table-container">
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
        ) : (
          <table className="table">
            <thead><tr>
              <th>Cliente</th><th>Regime</th><th>Honorário</th>
              <th>Vencimento</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {filtrados.map(c => {
                const st = statusCliente(c)
                const stBadge = { pago: 'badge-green', pendente: 'badge-yellow', atraso: 'badge-red', isento: 'badge-gray' }[st]
                const stLabel = { pago: 'Pago', pendente: 'Pendente', atraso: 'Em atraso', isento: 'Isento' }[st]
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="font-medium text-gray-900">{c.nome}</div>
                      {c.telefone && <div className="text-xs text-gray-500">{c.telefone}</div>}
                    </td>
                    <td className="text-gray-600">{c.regime || '—'}</td>
                    <td className="font-semibold text-gray-900">{fmt(c.valor_honorario)}</td>
                    <td className="text-gray-600">Dia {c.dia_vencimento || 10}</td>
                    <td><span className={stBadge}>{stLabel}</span></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {st === 'pago' && (
                          <button onClick={() => desmarcarPago(c.id)} className="btn-ghost btn-sm gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5" /> Desfazer
                          </button>
                        )}
                        {(st === 'pendente' || st === 'atraso') && (
                          <>
                            <button onClick={() => marcarPago(c.id)} className="btn-secondary btn-sm gap-1.5 text-green-700 border-green-300 hover:bg-green-50">
                              <CheckCircle className="w-3.5 h-3.5" /> Marcar pago
                            </button>
                            <button onClick={() => marcarIsento(c.id)} className="btn-ghost btn-sm gap-1.5 text-gray-500" title="Isentar este mês (não conta como pendente/atraso)">
                              <Ban className="w-3.5 h-3.5" /> Isentar
                            </button>
                          </>
                        )}
                        {registroExistente(c.id) && (
                          <button onClick={() => excluirRegistro(c.id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50" title="Excluir registro deste mês">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-500">Nenhum registro encontrado</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
