import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Search, Edit2, Trash2, ChevronDown, Wand2, Loader2, X, Save, UserPlus, CheckCircle2 } from 'lucide-react'

const OBR_CATALOG = [
  { id: 'das_mei', nome: 'DAS-MEI', dia: 20, regimes: ['MEI'] },
  { id: 'das', nome: 'DAS — Simples Nacional', dia: 20, regimes: ['Simples Nacional'] },
  { id: 'dctf', nome: 'DCTF Mensal', dia: 20, regimes: ['Simples Nacional','Lucro Presumido','Lucro Real','Entidade / Assoc.','Partido Político'] },
  { id: 'sped_fiscal', nome: 'SPED Fiscal', dia: 15, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'sped_contrib', nome: 'SPED Contribuições', dia: 10, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'efd_reinf', nome: 'EFD-Reinf', dia: 15, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'esocial', nome: 'eSocial', dia: 7, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'irpj', nome: 'IRPJ Trimestral', dia: 30, regimes: ['Lucro Presumido'] },
  { id: 'ecf', nome: 'ECF (anual)', dia: 31, regimes: ['Lucro Presumido','Lucro Real'] },
  { id: 'folha', nome: 'Folha de Pagamento', dia: 5, regimes: [] },
  { id: 'fgts', nome: 'FGTS', dia: 7, regimes: [] },
  { id: 'nfse', nome: 'Nota Fiscal de Serviço', dia: 10, regimes: [] },
  { id: 'dirf', nome: 'DIRF (anual)', dia: 28, regimes: [] },
  { id: 'rais', nome: 'RAIS (anual)', dia: 31, regimes: [] },
]

const REGIMES = ['MEI','Simples Nacional','Lucro Presumido','Lucro Real','Entidade / Assoc.','Partido Político']
const COLABS = ['Carlos','Ana','Pedro','Maria']

const emptyForm = {
  nome: '', cnpj: '', regime: '', valor_honorario: '', dia_vencimento: 10,
  telefone: '', email: '', email2: '', tipo: 'recorrente', obrigacoes: []
}

export default function Clientes() {
  const { isGestor } = useAuth()
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroRegime, setFiltroRegime] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [obrSel, setObrSel] = useState({}) // {obrId: {sel: bool, resp: string}}
  const [convidando, setConvidando] = useState(null) // id do cliente sendo convidado

  useEffect(() => { fetchClientes() }, [])

  async function fetchClientes() {
    setLoading(true)
    const { data } = await supabase.from('clientes').select('*').order('nome')
    setClientes(data || [])
    setLoading(false)
  }

  function abrirNovo() {
    setForm(emptyForm); setEditId(null); setObrSel({}); setModalOpen(true)
  }

  function abrirEditar(c) {
    setForm({
      nome: c.nome || '', cnpj: c.cnpj || '', regime: c.regime || '',
      valor_honorario: c.valor_honorario || '', dia_vencimento: c.dia_vencimento || 10,
      telefone: c.telefone || '', email: c.email || '', email2: c.email2 || '',
      tipo: c.tipo || 'recorrente', obrigacoes: c.obrigacoes || []
    })
    const sel = {}
    ;(c.obrigacoes || []).forEach(o => { sel[o.id] = { sel: true, resp: o.resp || 'Carlos' } })
    setObrSel(sel)
    setEditId(c.id)
    setModalOpen(true)
  }

  function sugerirObrigacoes() {
    const regime = form.regime
    const novo = { ...obrSel }
    OBR_CATALOG.forEach(o => {
      if (o.regimes.includes(regime) && !novo[o.id]) {
        novo[o.id] = { sel: true, resp: 'Ana' }
      }
    })
    setObrSel(novo)
  }

  function toggleObr(id) {
    setObrSel(prev => ({
      ...prev,
      [id]: { sel: !prev[id]?.sel, resp: prev[id]?.resp || 'Carlos' }
    }))
  }

  function setObrResp(id, resp) {
    setObrSel(prev => ({ ...prev, [id]: { ...prev[id], resp } }))
  }

  async function salvar() {
    if (!form.nome) return
    setSaving(true)
    const obrigacoes = Object.entries(obrSel).filter(([,v]) => v.sel).map(([id,v]) => ({ id, resp: v.resp }))
    const payload = { ...form, valor_honorario: parseFloat(form.valor_honorario) || 0, dia_vencimento: parseInt(form.dia_vencimento) || 10, obrigacoes }
    if (editId) {
      await supabase.from('clientes').update(payload).eq('id', editId)
    } else {
      await supabase.from('clientes').insert(payload)
    }
    setSaving(false); setModalOpen(false); fetchClientes()
  }

  async function remover(id) {
    if (!window.confirm('Remover este cliente?')) return
    await supabase.from('clientes').delete().eq('id', id)
    fetchClientes()
  }

  async function convidarPortal(cliente) {
    if (!cliente.email) {
      alert('Este cliente não tem e-mail cadastrado. Adicione um e-mail antes de convidar.')
      return
    }
    if (!window.confirm(`Enviar convite do Portal do Cliente para ${cliente.email}?`)) return
    setConvidando(cliente.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/portal-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clienteId: cliente.id }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao enviar convite')
      alert(`Convite enviado para ${cliente.email}.`)
      fetchClientes()
    } catch (err) {
      alert(err.message)
    } finally {
      setConvidando(null)
    }
  }

  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) &&
    (!filtroRegime || c.regime === filtroRegime)
  )

  const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">{clientes.length} clientes cadastrados</p>
        </div>
        {isGestor && (
          <button onClick={abrirNovo} className="btn-primary">
            <Plus className="w-4 h-4" /> Novo cliente
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="select w-auto" value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)}>
          <option value="">Todos os regimes</option>
          {REGIMES.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="table-container">
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
        ) : (
          <table className="table">
            <thead><tr>
              <th>Cliente</th><th>Regime</th><th>Tipo</th>
              <th>Honorário</th><th>Venc.</th><th>Obrigações</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {filtrados.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="font-medium text-gray-900">{c.nome}</div>
                    {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                  </td>
                  <td>{c.regime || '—'}</td>
                  <td>
                    <span className={c.tipo === 'recorrente' ? 'badge-blue' : 'badge-gray'}>
                      {c.tipo === 'recorrente' ? 'Recorrente' : 'Temporário'}
                    </span>
                  </td>
                  <td className="font-medium">{c.valor_honorario ? fmt(c.valor_honorario) : '—'}</td>
                  <td>{c.dia_vencimento ? `Dia ${c.dia_vencimento}` : '—'}</td>
                  <td>
                    {(c.obrigacoes || []).length > 0
                      ? <span className="badge-blue">{c.obrigacoes.length} obrigação{c.obrigacoes.length > 1 ? 'ões' : ''}</span>
                      : <span className="text-gray-400 text-xs">Nenhuma</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      {isGestor && <>
                        <button onClick={() => abrirEditar(c)} className="btn-ghost btn-sm p-1.5"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => remover(c.id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                        {c.auth_user_id ? (
                          <span className="btn-ghost btn-sm p-1.5 text-green-600" title="Já tem acesso ao Portal do Cliente">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => convidarPortal(c)}
                            disabled={convidando === c.id}
                            className="btn-ghost btn-sm p-1.5 text-brand-600 hover:bg-brand-50"
                            title="Convidar para o Portal do Cliente"
                          >
                            {convidando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-500">Nenhum cliente encontrado</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="text-lg font-semibold text-gray-900">{editId ? 'Editar cliente' : 'Novo cliente'}</h2>
              <button onClick={() => setModalOpen(false)} className="btn-ghost p-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group col-span-2">
                  <label className="form-label">Nome / Razão social *</label>
                  <input className="input" value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} placeholder="Nome completo ou razão social" />
                </div>
                <div className="form-group">
                  <label className="form-label">CNPJ / CPF</label>
                  <input className="input" value={form.cnpj} onChange={e => setForm(f => ({...f, cnpj: e.target.value}))} placeholder="00.000.000/0001-00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Regime tributário</label>
                  <select className="select" value={form.regime} onChange={e => setForm(f => ({...f, regime: e.target.value}))}>
                    <option value="">Selecione...</option>
                    {REGIMES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Honorário mensal (R$)</label>
                  <input type="number" className="input" value={form.valor_honorario} onChange={e => setForm(f => ({...f, valor_honorario: e.target.value}))} placeholder="0,00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Dia de vencimento</label>
                  <input type="number" min={1} max={31} className="input" value={form.dia_vencimento} onChange={e => setForm(f => ({...f, dia_vencimento: e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp / Telefone</label>
                  <input className="input" value={form.telefone} onChange={e => setForm(f => ({...f, telefone: e.target.value}))} placeholder="(75) 99999-0000" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail principal</label>
                  <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="contato@empresa.com.br" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-mail secundário</label>
                  <input type="email" className="input" value={form.email2} onChange={e => setForm(f => ({...f, email2: e.target.value}))} placeholder="financeiro@empresa.com.br" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de cliente</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm(f => ({...f, tipo: 'recorrente'}))}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${form.tipo === 'recorrente' ? 'bg-brand-50 text-brand-700 border-brand-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      ↻ Recorrente
                    </button>
                    <button type="button" onClick={() => setForm(f => ({...f, tipo: 'temporario'}))}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all ${form.tipo === 'temporario' ? 'bg-gray-100 text-gray-800 border-gray-400' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                      ⏱ Temporário
                    </button>
                  </div>
                </div>
              </div>

              {/* Obrigações */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Obrigações fiscais vinculadas</h3>
                  <button type="button" onClick={sugerirObrigacoes} className="btn-secondary btn-sm gap-1.5">
                    <Wand2 className="w-3.5 h-3.5" /> Sugerir pelo regime
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {OBR_CATALOG.map(o => {
                    const sel = obrSel[o.id]?.sel || false
                    const resp = obrSel[o.id]?.resp || 'Carlos'
                    return (
                      <div key={o.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${sel ? 'bg-brand-50 border-brand-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                        <input type="checkbox" checked={sel} onChange={() => toggleObr(o.id)} className="w-4 h-4 accent-brand-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0" onClick={() => toggleObr(o.id)}>
                          <div className="text-xs font-medium text-gray-900 truncate">{o.nome}</div>
                          <div className="text-xs text-gray-500">Dia {o.dia}</div>
                        </div>
                        {sel && (
                          <select className="text-xs border border-gray-300 rounded px-1 py-0.5 w-16 flex-shrink-0" value={resp} onChange={e => { e.stopPropagation(); setObrResp(o.id, e.target.value) }}>
                            {COLABS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Salvando...' : 'Salvar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
