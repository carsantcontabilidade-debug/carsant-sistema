import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Loader2, Search, AlertTriangle, Percent, Wallet } from 'lucide-react'

const MES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function fmt(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function anoMes(ano, mes) { return ano * 12 + mes }

// Lista de {ano, mes} (0-indexado) entre dois pontos, inclusive.
function gerarMeses(inicio, fim) {
  const meses = []
  for (let am = anoMes(inicio.ano, inicio.mes); am <= anoMes(fim.ano, fim.mes); am++) {
    meses.push({ ano: Math.floor(am / 12), mes: ((am % 12) + 12) % 12 })
  }
  return meses
}

export default function InadimplenciaTotal() {
  const hoje = new Date()
  const anoAtual = hoje.getFullYear()
  const [clientes, setClientes] = useState([])
  const [pagamentos, setPagamentos] = useState([])
  const [descontos, setDescontos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [periodoInicio, setPeriodoInicio] = useState({ mes: 0, ano: anoAtual - 1 })
  const [periodoFim, setPeriodoFim] = useState({ mes: hoje.getMonth(), ano: anoAtual })
  const [modalDetalhe, setModalDetalhe] = useState(null) // cliente
  const [modalDesconto, setModalDesconto] = useState(null) // cliente
  const [formDesconto, setFormDesconto] = useState({ valor: '', motivo: '' })
  const [salvandoDesconto, setSalvandoDesconto] = useState(false)
  const [editandoSaldo, setEditandoSaldo] = useState(null) // cliente
  const [saldoForm, setSaldoForm] = useState('')
  const [salvandoSaldo, setSalvandoSaldo] = useState(false)

  useEffect(() => { fetchDados() }, [])

  async function fetchDados() {
    setLoading(true)
    const [{ data: c }, { data: p }, { data: d }] = await Promise.all([
      supabase.from('clientes').select('id, nome, valor_honorario, dia_vencimento, honorario_inicio, saldo_devedor_migrado').gt('valor_honorario', 0).order('nome'),
      supabase.from('pagamentos_honorarios').select('cliente_id, mes, ano, pago, isento, oculto'),
      supabase.from('descontos_honorarios').select('*').order('created_at', { ascending: false }),
    ])
    setClientes(c || [])
    setPagamentos(p || [])
    setDescontos(d || [])
    setLoading(false)
  }

  // Mês inteiramente no passado e sem pagamento/isenção/ocultação = em
  // atraso. Mês atual só conta se o dia de vencimento já passou. Mês
  // futuro nunca conta.
  function mesEmAtraso(cliente, ano, mes, registro) {
    if (registro?.pago || registro?.isento || registro?.oculto) return false
    const hojeAnoMes = anoMes(hoje.getFullYear(), hoje.getMonth())
    const alvoAnoMes = anoMes(ano, mes)
    if (alvoAnoMes < hojeAnoMes) return true
    if (alvoAnoMes > hojeAnoMes) return false
    const venc = new Date(ano, mes, cliente.dia_vencimento || 10)
    return hoje > venc
  }

  function calcularCliente(cliente) {
    const inicioCliente = cliente.honorario_inicio ? new Date(`${cliente.honorario_inicio}T00:00:00`) : null
    const inicioEfetivo = inicioCliente && anoMes(inicioCliente.getFullYear(), inicioCliente.getMonth()) > anoMes(periodoInicio.ano, periodoInicio.mes)
      ? { ano: inicioCliente.getFullYear(), mes: inicioCliente.getMonth() }
      : periodoInicio
    const fimEfetivo = anoMes(periodoFim.ano, periodoFim.mes) > anoMes(hoje.getFullYear(), hoje.getMonth())
      ? { ano: hoje.getFullYear(), mes: hoje.getMonth() }
      : periodoFim

    const mesesEmAtraso = []
    if (anoMes(inicioEfetivo.ano, inicioEfetivo.mes) <= anoMes(fimEfetivo.ano, fimEfetivo.mes)) {
      for (const { ano, mes } of gerarMeses(inicioEfetivo, fimEfetivo)) {
        const registro = pagamentos.find(p => p.cliente_id === cliente.id && p.mes === mes && p.ano === ano)
        if (mesEmAtraso(cliente, ano, mes, registro)) {
          mesesEmAtraso.push({ ano, mes, valor: cliente.valor_honorario })
        }
      }
    }

    const totalAtrasoPeriodo = mesesEmAtraso.reduce((s, m) => s + m.valor, 0)
    const saldoMigrado = cliente.saldo_devedor_migrado || 0
    const descontosCliente = descontos.filter(d => d.cliente_id === cliente.id)
    const totalDescontos = descontosCliente.reduce((s, d) => s + d.valor, 0)
    const totalDevedor = Math.max(0, totalAtrasoPeriodo + saldoMigrado - totalDescontos)

    return { mesesEmAtraso, totalAtrasoPeriodo, saldoMigrado, descontosCliente, totalDescontos, totalDevedor }
  }

  const linhas = clientes
    .filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))
    .map(c => ({ cliente: c, ...calcularCliente(c) }))
    .filter(l => l.totalDevedor > 0)
    .sort((a, b) => b.totalDevedor - a.totalDevedor)

  const totalGeral = linhas.reduce((s, l) => s + l.totalDevedor, 0)

  function abrirDesconto(cliente) {
    setModalDesconto(cliente)
    setFormDesconto({ valor: '', motivo: '' })
  }

  async function salvarDesconto(e) {
    e.preventDefault()
    const valor = parseFloat(formDesconto.valor)
    if (!valor || valor <= 0) { alert('Informe um valor de desconto maior que zero.'); return }
    setSalvandoDesconto(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('descontos_honorarios').insert({
        cliente_id: modalDesconto.id,
        valor,
        motivo: formDesconto.motivo || null,
        concedido_por: user?.id,
      })
      if (error) throw error
      setModalDesconto(null)
      fetchDados()
    } catch (err) {
      alert(`Não foi possível salvar o desconto: ${err.message}`)
    } finally {
      setSalvandoDesconto(false)
    }
  }

  function abrirEditarSaldo(cliente) {
    setEditandoSaldo(cliente)
    setSaldoForm(String(cliente.saldo_devedor_migrado || ''))
  }

  async function salvarSaldoMigrado(e) {
    e.preventDefault()
    setSalvandoSaldo(true)
    try {
      const valor = parseFloat(saldoForm) || 0
      const { error } = await supabase.from('clientes').update({ saldo_devedor_migrado: valor }).eq('id', editandoSaldo.id)
      if (error) throw error
      setEditandoSaldo(null)
      fetchDados()
    } catch (err) {
      alert(`Não foi possível salvar o saldo: ${err.message}`)
    } finally {
      setSalvandoSaldo(false)
    }
  }

  const anosDisponiveis = Array.from({ length: 6 }, (_, i) => anoAtual - 4 + i)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-red-500" /> Inadimplência Total
        </h1>
        <p className="text-sm text-gray-500 mt-1">Total devedor por cliente, somando todos os meses em atraso do período, saldo migrado de outro sistema e descontos concedidos.</p>
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="form-group sm:col-span-2 lg:col-span-1">
            <label className="form-label">Buscar cliente</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Nome..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Período — de</label>
            <div className="flex gap-1.5">
              <select className="select" value={periodoInicio.mes} onChange={e => setPeriodoInicio(p => ({ ...p, mes: parseInt(e.target.value) }))}>
                {MES_NOMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select className="select w-24" value={periodoInicio.ano} onChange={e => setPeriodoInicio(p => ({ ...p, ano: parseInt(e.target.value) }))}>
                {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Período — até</label>
            <div className="flex gap-1.5">
              <select className="select" value={periodoFim.mes} onChange={e => setPeriodoFim(p => ({ ...p, mes: parseInt(e.target.value) }))}>
                {MES_NOMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select className="select w-24" value={periodoFim.ano} onChange={e => setPeriodoFim(p => ({ ...p, ano: parseInt(e.target.value) }))}>
                {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total inadimplente</div>
            <div className="stat-value text-red-600">{fmt(totalGeral)}</div>
            <div className="stat-sub">{linhas.length} cliente(s)</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>Cliente</th><th>Meses em atraso</th><th>Total em atraso (período)</th>
              <th>Saldo migrado</th><th>Descontos</th><th>Total devedor</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {linhas.map(l => (
                <tr key={l.cliente.id}>
                  <td className="font-medium text-gray-900">{l.cliente.nome}</td>
                  <td className="text-gray-600">{l.mesesEmAtraso.length}</td>
                  <td className="text-gray-800">{fmt(l.totalAtrasoPeriodo)}</td>
                  <td className="text-gray-600">{l.saldoMigrado > 0 ? fmt(l.saldoMigrado) : '—'}</td>
                  <td className="text-gray-600">{l.totalDescontos > 0 ? `- ${fmt(l.totalDescontos)}` : '—'}</td>
                  <td className="font-bold text-red-600">{fmt(l.totalDevedor)}</td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setModalDetalhe(l)} className="btn-ghost btn-sm">Detalhes</button>
                      <button onClick={() => abrirDesconto(l.cliente)} className="btn-ghost btn-sm gap-1 text-gray-500" title="Aplicar desconto">
                        <Percent className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => abrirEditarSaldo(l.cliente)} className="btn-ghost btn-sm gap-1 text-gray-500" title="Editar saldo migrado de outro sistema">
                        <Wallet className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-500">Nenhum cliente inadimplente no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal detalhe */}
      {modalDetalhe && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">{modalDetalhe.cliente.nome}</h2>
                <button onClick={() => setModalDetalhe(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>

              <div className="space-y-1 text-sm mb-4">
                <div className="flex justify-between"><span className="text-gray-500">Total em atraso (período)</span><span className="font-medium">{fmt(modalDetalhe.totalAtrasoPeriodo)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Saldo migrado de outro sistema</span><span className="font-medium">{fmt(modalDetalhe.saldoMigrado)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Descontos concedidos</span><span className="font-medium text-green-600">- {fmt(modalDetalhe.totalDescontos)}</span></div>
                <div className="flex justify-between pt-2 border-t border-gray-100 text-base"><span className="font-semibold">Total devedor</span><span className="font-bold text-red-600">{fmt(modalDetalhe.totalDevedor)}</span></div>
              </div>

              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Meses em atraso</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {modalDetalhe.mesesEmAtraso.length === 0 && <p className="text-sm text-gray-400">Nenhum mês em atraso no período.</p>}
                  {modalDetalhe.mesesEmAtraso.map((m, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600">{MES_NOMES[m.mes]} / {m.ano}</span>
                      <span className="text-gray-800">{fmt(m.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {modalDetalhe.descontosCliente.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Histórico de descontos</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {modalDetalhe.descontosCliente.map(d => (
                      <div key={d.id} className="flex justify-between text-sm">
                        <span className="text-gray-600">{new Date(d.created_at).toLocaleDateString('pt-BR')}{d.motivo ? ` — ${d.motivo}` : ''}</span>
                        <span className="text-green-600">- {fmt(d.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal desconto */}
      {modalDesconto && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Aplicar desconto</h2>
                <button onClick={() => setModalDesconto(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <p className="text-sm text-gray-500 mb-4">{modalDesconto.nome}</p>
              <form onSubmit={salvarDesconto} className="space-y-3">
                <div className="form-group">
                  <label className="form-label">Valor do desconto (R$) *</label>
                  <input type="number" step="0.01" min="0.01" className="input" value={formDesconto.valor} onChange={e => setFormDesconto(f => ({ ...f, valor: e.target.value }))} required autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Motivo (opcional)</label>
                  <input className="input" value={formDesconto.motivo} onChange={e => setFormDesconto(f => ({ ...f, motivo: e.target.value }))} placeholder="Ex: acordo de renegociação" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={salvandoDesconto} className="btn-primary flex-1 justify-center">
                    {salvandoDesconto ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar desconto'}
                  </button>
                  <button type="button" onClick={() => setModalDesconto(null)} className="btn-secondary">Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal saldo migrado */}
      {editandoSaldo && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Saldo devedor migrado</h2>
                <button onClick={() => setEditandoSaldo(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
              </div>
              <p className="text-sm text-gray-500 mb-4">{editandoSaldo.nome} — valor trazido de outro sistema, antes deste sistema existir.</p>
              <form onSubmit={salvarSaldoMigrado} className="space-y-3">
                <div className="form-group">
                  <label className="form-label">Saldo devedor (R$)</label>
                  <input type="number" step="0.01" min="0" className="input" value={saldoForm} onChange={e => setSaldoForm(e.target.value)} autoFocus />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" disabled={salvandoSaldo} className="btn-primary flex-1 justify-center">
                    {salvandoSaldo ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                  </button>
                  <button type="button" onClick={() => setEditandoSaldo(null)} className="btn-secondary">Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
