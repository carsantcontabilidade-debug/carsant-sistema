import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Wand2, CheckCircle, RefreshCw, Edit2, Trash2, Search, Loader2, X, Save } from 'lucide-react'
import { format } from 'date-fns'

const OBR_CATALOG = [
  { id: 'das_mei', nome: 'DAS-MEI', dia: 20, tipo: 'declaracao' },
  { id: 'das', nome: 'DAS — Simples Nacional', dia: 20, tipo: 'declaracao' },
  { id: 'dctf', nome: 'DCTF Mensal', dia: 20, tipo: 'declaracao' },
  { id: 'sped_fiscal', nome: 'SPED Fiscal', dia: 15, tipo: 'declaracao' },
  { id: 'sped_contrib', nome: 'SPED Contribuições', dia: 10, tipo: 'declaracao' },
  { id: 'efd_reinf', nome: 'EFD-Reinf', dia: 15, tipo: 'declaracao' },
  { id: 'esocial', nome: 'eSocial', dia: 7, tipo: 'declaracao' },
  { id: 'irpj', nome: 'IRPJ Trimestral', dia: 30, tipo: 'declaracao' },
  { id: 'folha', nome: 'Folha de Pagamento', dia: 5, tipo: 'declaracao' },
  { id: 'fgts', nome: 'FGTS', dia: 7, tipo: 'declaracao' },
]

const TIPOS = ['declaracao','abertura','anual','atendimento','administrativo','outro']
const TIPO_LABEL = { declaracao: 'Declaração', abertura: 'Abertura', anual: 'Anual', atendimento: 'Atendimento', administrativo: 'Administrativo', outro: 'Outro' }
const COLABS = ['Carlos','Ana','Pedro','Maria']
const MES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const emptyForm = { descricao: '', cliente_nome: '', tipo: 'declaracao', responsavel: 'Carlos', prazo: '', prioridade: 'media', status: 'pendente', obs: '' }

export default function Tarefas() {
  const { profile, isGestor } = useAuth()
  const hoje = new Date()
  const hojeStr = format(hoje, 'yyyy-MM-dd')
  const [tarefas, setTarefas] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroResp, setFiltroResp] = useState(isGestor ? '' : profile?.nome || '')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalGerar, setModalGerar] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [genMes, setGenMes] = useState(hoje.getMonth())
  const [genAno, setGenAno] = useState(hoje.getFullYear())
  const [aba, setAba] = useState('lista') // lista | empresa | equipe

  useEffect(() => { fetchDados() }, [])

  async function fetchDados() {
    setLoading(true)
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('tarefas').select('*').order('prazo'),
      supabase.from('clientes').select('id,nome,obrigacoes').order('nome')
    ])
    const hoje = new Date()
    const hojeStr = format(hoje, 'yyyy-MM-dd')
    const tarefasAtualizadas = (t || []).map(tarefa => ({
      ...tarefa,
      status: tarefa.status !== 'concluida' && tarefa.prazo && tarefa.prazo < hojeStr ? 'atrasada' : tarefa.status
    }))
    setTarefas(tarefasAtualizadas)
    setClientes(c || [])
    setLoading(false)
  }

  async function gerarTarefas() {
    setGerando(true)
    const mesLabel = `${MES_NOMES[genMes]}/${genAno}`
    const mesRef = `${genMes}_${genAno}`
    const novas = []
    clientes.forEach(c => {
      (c.obrigacoes || []).forEach(o => {
        const cat = OBR_CATALOG.find(x => x.id === o.id)
        if (!cat) return
        const jaExiste = tarefas.some(t => t.gerada && t.cliente_nome === c.nome && t.obr_id === o.id && t.mes_ref === mesRef)
        if (jaExiste) return
        const prazoStr = `${genAno}-${String(genMes + 1).padStart(2, '0')}-${String(cat.dia).padStart(2, '0')}`
        novas.push({
          descricao: `${cat.nome} — ${c.nome} — ${mesLabel}`,
          cliente_nome: c.nome, tipo: cat.tipo,
          responsavel: o.resp || 'Carlos',
          prazo: prazoStr, prioridade: 'alta',
          status: prazoStr < hojeStr ? 'atrasada' : 'pendente',
          gerada: true, obr_id: o.id, mes_ref: mesRef
        })
      })
    })
    if (novas.length > 0) await supabase.from('tarefas').insert(novas)
    await fetchDados()
    setModalGerar(false)
    setGerando(false)
    alert(novas.length > 0 ? `✅ ${novas.length} tarefa(s) gerada(s)!` : '⚠️ Todas as tarefas deste mês já existem.')
  }

  async function concluir(id) {
    await supabase.from('tarefas').update({ status: 'concluida' }).eq('id', id)
    fetchDados()
  }
  async function reabrir(id, prazo) {
    const status = prazo && prazo < hojeStr ? 'atrasada' : 'pendente'
    await supabase.from('tarefas').update({ status }).eq('id', id)
    fetchDados()
  }
  async function remover(id) {
    if (!window.confirm('Remover esta tarefa?')) return
    await supabase.from('tarefas').delete().eq('id', id); fetchDados()
  }

  function abrirNovo() { setForm(emptyForm); setEditId(null); setModalOpen(true) }
  function abrirEditar(t) {
    setForm({ descricao: t.descricao, cliente_nome: t.cliente_nome || '', tipo: t.tipo, responsavel: t.responsavel, prazo: t.prazo || '', prioridade: t.prioridade, status: t.status === 'atrasada' ? 'pendente' : t.status, obs: t.obs || '' })
    setEditId(t.id); setModalOpen(true)
  }
  async function salvar() {
    if (!form.descricao) return
    setSaving(true)
    const prazo = form.prazo
    let status = form.status
    if (status !== 'concluida' && prazo && prazo < hojeStr) status = 'atrasada'
    const payload = { ...form, status, gerada: false }
    if (editId) await supabase.from('tarefas').update(payload).eq('id', editId)
    else await supabase.from('tarefas').insert(payload)
    setSaving(false); setModalOpen(false); fetchDados()
  }

  const PRI = { alta: '🔴', media: '🟡', baixa: '⚪' }
  const stBadge = { concluida: 'badge-green', pendente: 'badge-yellow', atrasada: 'badge-red', andamento: 'badge-blue' }
  const stLabel = { concluida: 'Concluída', pendente: 'Pendente', atrasada: 'Atrasada', andamento: 'Andamento' }

  const filtradas = tarefas.filter(t =>
    (t.descricao || '').toLowerCase().includes(busca.toLowerCase()) &&
    (!filtroStatus || t.status === filtroStatus) &&
    (!filtroResp || t.responsavel === filtroResp) &&
    (isGestor || t.responsavel === profile?.nome)
  ).sort((a, b) => {
    const ord = { atrasada: 0, pendente: 1, andamento: 2, concluida: 3 }
    return (ord[a.status] || 1) - (ord[b.status] || 1)
  })

  const tot = filtradas.length
  const conc = filtradas.filter(t => t.status === 'concluida').length
  const atr = filtradas.filter(t => t.status === 'atrasada').length

  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 0)
    return { mes: (hoje.getMonth() - i + 12) % 12, ano: hoje.getMonth() - i < 0 ? hoje.getFullYear() - 1 : hoje.getFullYear(), label: `${MES_NOMES[(hoje.getMonth() - i + 12) % 12]} ${hoje.getMonth() - i < 0 ? hoje.getFullYear() - 1 : hoje.getFullYear()}` }
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarefas</h1>
          <p className="text-sm text-gray-500 mt-1">{atr > 0 ? `⚠️ ${atr} em atraso · ` : ''}{tot - conc} em aberto</p>
        </div>
        <div className="flex gap-2">
          {isGestor && <>
            <button onClick={() => setModalGerar(true)} className="btn-secondary gap-2 text-green-700 border-green-300 hover:bg-green-50">
              <Wand2 className="w-4 h-4"/> Gerar tarefas do mês
            </button>
            <button onClick={abrirNovo} className="btn-primary"><Plus className="w-4 h-4"/> Nova</button>
          </>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-5 w-fit">
        {['lista','empresa','equipe'].map(t => (
          <button key={t} onClick={() => setAba(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${aba === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            {t === 'lista' ? 'Lista' : t === 'empresa' ? 'Por Empresa' : 'Por Colaborador'}
          </button>
        ))}
      </div>

      {aba === 'lista' && <>
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input className="input pl-9" placeholder="Buscar tarefa..." value={busca} onChange={e => setBusca(e.target.value)}/>
          </div>
          <select className="select w-auto" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="">Todos status</option>
            <option value="pendente">Pendente</option>
            <option value="andamento">Em andamento</option>
            <option value="concluida">Concluída</option>
            <option value="atrasada">Atrasada</option>
          </select>
          {isGestor && <select className="select w-auto" value={filtroResp} onChange={e => setFiltroResp(e.target.value)}>
            <option value="">Todos</option>
            {COLABS.map(c => <option key={c}>{c}</option>)}
          </select>}
        </div>

        <div className="table-container">
          {loading ? <div className="flex justify-center h-32 items-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600"/></div> : (
            <table className="table">
              <thead><tr><th>Tarefa</th><th>Cliente</th><th>Responsável</th><th>Prazo</th><th>Pri.</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {filtradas.map(t => (
                  <tr key={t.id}>
                    <td>
                      <div className={`font-medium ${t.status === 'concluida' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {t.gerada && <span className="text-brand-500 mr-1" title="Gerada automaticamente">⚡</span>}
                        {t.descricao}
                      </div>
                      <div className="text-xs text-gray-500">{TIPO_LABEL[t.tipo] || t.tipo}</div>
                    </td>
                    <td className="text-gray-600 text-sm">{t.cliente_nome || '—'}</td>
                    <td className="text-gray-600">{t.responsavel}</td>
                    <td className={`text-sm ${t.status === 'atrasada' ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                      {t.prazo ? t.prazo.split('-').reverse().join('/') : '—'}
                    </td>
                    <td>{PRI[t.prioridade] || '⚪'}</td>
                    <td><span className={stBadge[t.status] || 'badge-gray'}>{stLabel[t.status] || t.status}</span></td>
                    <td>
                      <div className="flex gap-1">
                        {t.status !== 'concluida'
                          ? <button onClick={() => concluir(t.id)} className="btn-ghost btn-sm text-green-600"><CheckCircle className="w-4 h-4"/></button>
                          : <button onClick={() => reabrir(t.id, t.prazo)} className="btn-ghost btn-sm"><RefreshCw className="w-4 h-4"/></button>}
                        {isGestor && <>
                          <button onClick={() => abrirEditar(t)} className="btn-ghost btn-sm"><Edit2 className="w-3.5 h-3.5"/></button>
                          <button onClick={() => remover(t.id)} className="btn-ghost btn-sm text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-500">Nenhuma tarefa encontrada</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </>}

      {aba === 'empresa' && (
        <div className="space-y-3">
          {Object.entries(
            tarefas.filter(t => t.cliente_nome).reduce((acc, t) => { acc[t.cliente_nome] = [...(acc[t.cliente_nome] || []), t]; return acc }, {})
          ).sort(([a],[b]) => a.localeCompare(b)).map(([empresa, ts]) => {
            const atr = ts.filter(t => t.status === 'atrasada').length
            const ab = ts.filter(t => t.status !== 'concluida').length
            return (
              <details key={empresa} className="card group">
                <summary className="card-header flex items-center justify-between cursor-pointer list-none">
                  <span className="font-semibold text-gray-900">{empresa}</span>
                  <div className="flex gap-3 text-sm">
                    {atr > 0 && <span className="text-red-600">{atr} atrasada{atr>1?'s':''}</span>}
                    <span className="text-yellow-600">{ab} em aberto</span>
                    <span className="text-green-600">{ts.filter(t => t.status === 'concluida').length} concluídas</span>
                  </div>
                </summary>
                <div className="divide-y divide-gray-100">
                  {ts.map(t => (
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <span className={`text-sm ${t.status === 'concluida' ? 'line-through text-gray-400' : ''}`}>{PRI[t.prioridade]} {t.descricao}</span>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-xs text-gray-500">{t.responsavel}</span>
                        <span className={stBadge[t.status] || 'badge-gray'}>{stLabel[t.status]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
      )}

      {aba === 'equipe' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(isGestor ? COLABS : [profile?.nome]).filter(Boolean).map(colab => {
            const minhas = tarefas.filter(t => t.responsavel === colab && t.status !== 'concluida')
            const atr = minhas.filter(t => t.status === 'atrasada').length
            return (
              <div key={colab} className="card">
                <div className="card-header flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{colab}</span>
                  <div className="flex gap-3 text-sm">
                    {atr > 0 && <span className="text-red-600">{atr} atrasada{atr>1?'s':''}</span>}
                    <span className="text-gray-500">{minhas.length} em aberto</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {minhas.slice(0, 6).map(t => (
                    <div key={t.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                      <span className="text-sm truncate">{PRI[t.prioridade]} {t.descricao}</span>
                      <span className={`text-xs flex-shrink-0 ${t.status === 'atrasada' ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        {t.prazo ? t.prazo.split('-').reverse().join('/') : '—'}
                      </span>
                    </div>
                  ))}
                  {minhas.length === 0 && <div className="px-5 py-4 text-sm text-gray-500">Sem tarefas em aberto ✓</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal gerar */}
      {modalGerar && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalGerar(false)}>
          <div className="modal max-w-md">
            <div className="modal-header">
              <h2 className="text-lg font-semibold">Gerar tarefas automáticas</h2>
              <button onClick={() => setModalGerar(false)} className="btn-ghost p-2"><X className="w-5 h-5"/></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="form-group">
                <label className="form-label">Mês de referência</label>
                <select className="select" value={`${genMes}_${genAno}`} onChange={e => { const[m,a]=e.target.value.split('_'); setGenMes(parseInt(m)); setGenAno(parseInt(a)) }}>
                  {meses.map(m => <option key={`${m.mes}_${m.ano}`} value={`${m.mes}_${m.ano}`}>{m.label}</option>)}
                </select>
              </div>
              <p className="text-sm text-gray-600">O sistema irá criar tarefas para todos os clientes com obrigações fiscais vinculadas, sem duplicar as que já existem.</p>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalGerar(false)} className="btn-secondary">Cancelar</button>
              <button onClick={gerarTarefas} disabled={gerando} className="btn-primary bg-green-600 hover:bg-green-700">
                {gerando ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>}
                {gerando ? 'Gerando...' : 'Gerar agora'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nova/editar tarefa */}
      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="text-lg font-semibold">{editId ? 'Editar tarefa' : 'Nova tarefa'}</h2>
              <button onClick={() => setModalOpen(false)} className="btn-ghost p-2"><X className="w-5 h-5"/></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group col-span-2"><label className="form-label">Descrição *</label><input className="input" value={form.descricao} onChange={e => setForm(f=>({...f,descricao:e.target.value}))} placeholder="Ex: DAS — Empresa X — Maio/2026"/></div>
                <div className="form-group"><label className="form-label">Cliente</label><input className="input" list="dl-clientes-t" value={form.cliente_nome} onChange={e => setForm(f=>({...f,cliente_nome:e.target.value}))} placeholder="Nome do cliente"/><datalist id="dl-clientes-t">{clientes.map(c=><option key={c.id} value={c.nome}/>)}</datalist></div>
                <div className="form-group"><label className="form-label">Tipo</label><select className="select" value={form.tipo} onChange={e => setForm(f=>({...f,tipo:e.target.value}))}>{TIPOS.map(t=><option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Responsável</label><select className="select" value={form.responsavel} onChange={e => setForm(f=>({...f,responsavel:e.target.value}))}>{COLABS.map(c=><option key={c}>{c}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Prazo</label><input type="date" className="input" value={form.prazo} onChange={e => setForm(f=>({...f,prazo:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Prioridade</label><select className="select" value={form.prioridade} onChange={e => setForm(f=>({...f,prioridade:e.target.value}))}><option value="alta">🔴 Alta</option><option value="media">🟡 Média</option><option value="baixa">⚪ Baixa</option></select></div>
                <div className="form-group"><label className="form-label">Status</label><select className="select" value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value}))}><option value="pendente">Pendente</option><option value="andamento">Em andamento</option><option value="concluida">Concluída</option></select></div>
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
