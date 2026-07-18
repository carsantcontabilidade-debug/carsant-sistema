// src/pages/ContasPagar.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, CheckCircle, RefreshCw, Edit2, Trash2, Search, Loader2, X, Save } from 'lucide-react'

const CATEGORIAS = ['Aluguel','Salários / Pró-labore','Sistemas / Softwares','Contador','Energia / Água / Internet','Impostos','Comissões','Outras']
const MES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const emptyForm = { descricao: '', categoria: '', valor: '', dia_vencimento: 10, fornecedor: '', recorrencia: 'mensal', obs: '' }

export default function ContasPagar() {
  const { isGestor } = useAuth()
  const hoje = new Date()
  const [mesAtivo, setMesAtivo] = useState(hoje.getMonth())
  const [anoAtivo, setAnoAtivo] = useState(hoje.getFullYear())
  const [despesas, setDespesas] = useState([])
  const [pagamentos, setPagamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchDados() }, [mesAtivo, anoAtivo])

  async function fetchDados() {
    setLoading(true)
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase.from('despesas').select('*').order('dia_vencimento'),
      supabase.from('pagamentos_despesas').select('*').eq('mes', mesAtivo).eq('ano', anoAtivo)
    ])
    setDespesas(d || []); setPagamentos(p || [])
    setLoading(false)
  }

  function statusDespesa(d) {
    const pago = pagamentos.find(p => p.despesa_id === d.id)?.pago
    if (pago) return 'pago'
    return hoje > new Date(anoAtivo, mesAtivo, d.dia_vencimento) ? 'atraso' : 'pendente'
  }

  async function marcarPago(id) {
    const ex = pagamentos.find(p => p.despesa_id === id)
    if (ex) await supabase.from('pagamentos_despesas').update({ pago: true }).eq('id', ex.id)
    else await supabase.from('pagamentos_despesas').insert({ despesa_id: id, mes: mesAtivo, ano: anoAtivo, pago: true })
    fetchDados()
  }
  async function desmarcarPago(id) {
    const ex = pagamentos.find(p => p.despesa_id === id)
    if (ex) await supabase.from('pagamentos_despesas').update({ pago: false }).eq('id', ex.id)
    fetchDados()
  }

  function abrirNovo() { setForm(emptyForm); setEditId(null); setModalOpen(true) }
  function abrirEditar(d) { setForm({ descricao: d.descricao, categoria: d.categoria, valor: d.valor, dia_vencimento: d.dia_vencimento, fornecedor: d.fornecedor || '', recorrencia: d.recorrencia, obs: d.obs || '' }); setEditId(d.id); setModalOpen(true) }

  async function salvar() {
    if (!form.descricao) return
    setSaving(true)
    const payload = { ...form, valor: parseFloat(form.valor) || 0, dia_vencimento: parseInt(form.dia_vencimento) || 10 }
    const { error } = editId
      ? await supabase.from('despesas').update(payload).eq('id', editId)
      : await supabase.from('despesas').insert(payload)
    setSaving(false)
    if (error) { alert(`Erro ao salvar despesa: ${error.message}`); return }
    setModalOpen(false); fetchDados()
  }

  async function remover(id) {
    if (!window.confirm('Remover esta despesa?')) return
    await supabase.from('despesas').delete().eq('id', id); fetchDados()
  }

  const mensais = despesas.filter(d => d.recorrencia === 'mensal')
  const total = mensais.reduce((s, d) => s + (d.valor || 0), 0)
  const pago = mensais.filter(d => statusDespesa(d) === 'pago').reduce((s, d) => s + (d.valor || 0), 0)
  const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR')
  const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); return { mes: d.getMonth(), ano: d.getFullYear(), label: `${MES_NOMES[d.getMonth()]} ${d.getFullYear()}` } })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contas a Pagar</h1>
          <p className="text-sm text-gray-500 mt-1">{despesas.length} despesas cadastradas</p>
        </div>
        <div className="flex gap-2">
          <select className="select w-auto" value={`${mesAtivo}_${anoAtivo}`} onChange={e => { const[m,a]=e.target.value.split('_'); setMesAtivo(parseInt(m)); setAnoAtivo(parseInt(a)) }}>
            {meses.map(m => <option key={`${m.mes}_${m.ano}`} value={`${m.mes}_${m.ano}`}>{m.label}</option>)}
          </select>
          {isGestor && <button onClick={abrirNovo} className="btn-primary"><Plus className="w-4 h-4" /> Nova despesa</button>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card"><div className="stat-label">Total mensal</div><div className="stat-value text-red-600">{fmt(total)}</div></div>
        <div className="stat-card"><div className="stat-label">Pago</div><div className="stat-value text-green-600">{fmt(pago)}</div></div>
        <div className="stat-card"><div className="stat-label">A pagar</div><div className="stat-value text-yellow-600">{fmt(total - pago)}</div></div>
      </div>

      <div className="table-container">
        {loading ? <div className="flex justify-center h-32 items-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600"/></div> : (
          <table className="table">
            <thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Venc.</th><th>Recorrência</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {despesas.map(d => {
                const st = statusDespesa(d)
                const stBadge = { pago: 'badge-green', pendente: 'badge-yellow', atraso: 'badge-red' }[st]
                const stLabel = { pago: 'Pago', pendente: 'Pendente', atraso: 'Em atraso' }[st]
                return (
                  <tr key={d.id}>
                    <td><div className="font-medium">{d.descricao}</div>{d.fornecedor && <div className="text-xs text-gray-500">{d.fornecedor}</div>}</td>
                    <td className="text-gray-600">{d.categoria}</td>
                    <td className="font-semibold">{fmt(d.valor)}</td>
                    <td>Dia {d.dia_vencimento}</td>
                    <td><span className="badge-gray capitalize">{d.recorrencia}</span></td>
                    <td><span className={stBadge}>{stLabel}</span></td>
                    <td>
                      <div className="flex gap-1">
                        {st !== 'pago' ? <button onClick={() => marcarPago(d.id)} className="btn-ghost btn-sm text-green-600"><CheckCircle className="w-4 h-4"/></button>
                          : <button onClick={() => desmarcarPago(d.id)} className="btn-ghost btn-sm"><RefreshCw className="w-4 h-4"/></button>}
                        {isGestor && <>
                          <button onClick={() => abrirEditar(d)} className="btn-ghost btn-sm"><Edit2 className="w-3.5 h-3.5"/></button>
                          <button onClick={() => remover(d.id)} className="btn-ghost btn-sm text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="text-lg font-semibold">{editId ? 'Editar despesa' : 'Nova despesa'}</h2>
              <button onClick={() => setModalOpen(false)} className="btn-ghost p-2"><X className="w-5 h-5"/></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group col-span-2"><label className="form-label">Descrição *</label><input className="input" value={form.descricao} onChange={e => setForm(f=>({...f,descricao:e.target.value}))} placeholder="Ex: Aluguel sala comercial"/></div>
                <div className="form-group"><label className="form-label">Categoria</label><select className="select" value={form.categoria} onChange={e => setForm(f=>({...f,categoria:e.target.value}))}><option value="">Selecione...</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Valor (R$)</label><input type="number" className="input" value={form.valor} onChange={e => setForm(f=>({...f,valor:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Dia vencimento</label><input type="number" min={1} max={31} className="input" value={form.dia_vencimento} onChange={e => setForm(f=>({...f,dia_vencimento:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Fornecedor</label><input className="input" value={form.fornecedor} onChange={e => setForm(f=>({...f,fornecedor:e.target.value}))} placeholder="Nome do fornecedor"/></div>
                <div className="form-group"><label className="form-label">Recorrência</label><select className="select" value={form.recorrencia} onChange={e => setForm(f=>({...f,recorrencia:e.target.value}))}><option value="mensal">Mensal</option><option value="unica">Única</option><option value="eventual">Eventual</option></select></div>
                <div className="form-group"><label className="form-label">Observação</label><input className="input" value={form.obs} onChange={e => setForm(f=>({...f,obs:e.target.value}))}/></div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
