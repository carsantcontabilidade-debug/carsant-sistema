import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, ChevronLeft, ChevronRight, Loader2, X, Save, Trash2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const TIPOS = ['reuniao','prazo','visita','outro']
const TIPO_LABEL = { reuniao: 'Reunião', prazo: 'Prazo fiscal', visita: 'Visita', outro: 'Outro' }
const TIPO_COLOR = { reuniao: 'bg-blue-100 text-blue-700', prazo: 'bg-red-100 text-red-700', visita: 'bg-yellow-100 text-yellow-700', outro: 'bg-gray-100 text-gray-600' }
const COLABS = ['Carlos','Ana','Pedro','Maria']
const emptyForm = { titulo: '', data: format(new Date(), 'yyyy-MM-dd'), hora: '', tipo: 'reuniao', cliente_nome: '', responsavel: 'Carlos', obs: '' }

export default function Agenda() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [eventos, setEventos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [diaSelecionado, setDiaSelecionado] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchDados() }, [])

  async function fetchDados() {
    setLoading(true)
    const [{ data: e }, { data: c }] = await Promise.all([
      supabase.from('eventos').select('*').order('data').order('hora'),
      supabase.from('clientes').select('id,nome').order('nome')
    ])
    setEventos(e || []); setClientes(c || [])
    setLoading(false)
  }

  function abrirNovo(data = null) {
    setForm({ ...emptyForm, data: data || format(new Date(), 'yyyy-MM-dd') })
    setEditId(null); setModalOpen(true)
  }
  function abrirEditar(e) {
    setForm({ titulo: e.titulo, data: e.data, hora: e.hora || '', tipo: e.tipo, cliente_nome: e.cliente_nome || '', responsavel: e.responsavel, obs: e.obs || '' })
    setEditId(e.id); setModalOpen(true)
  }
  async function salvar() {
    if (!form.titulo) return
    setSaving(true)
    if (editId) await supabase.from('eventos').update(form).eq('id', editId)
    else await supabase.from('eventos').insert(form)
    setSaving(false); setModalOpen(false); fetchDados()
  }
  async function remover(id) {
    await supabase.from('eventos').delete().eq('id', id); fetchDados()
  }

  // Gera dias do calendário
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = []
  let d = calStart
  while (d <= calEnd) { days.push(d); d = addDays(d, 1) }

  function eventosNoDia(date) {
    const str = format(date, 'yyyy-MM-dd')
    return eventos.filter(e => e.data === str)
  }

  const eventosDiaSel = diaSelecionado ? eventos.filter(e => e.data === diaSelecionado) : []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500 mt-1">
            {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <button onClick={() => abrirNovo()} className="btn-primary"><Plus className="w-4 h-4"/> Novo evento</button>
      </div>

      {/* Aviso Google Calendar */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 flex items-start gap-2 mb-5">
        <span className="flex-shrink-0 mt-0.5">ℹ️</span>
        <div>
          <strong>Sincronização com Google Calendar</strong> — será integrada em breve. Para já, gerencie seus eventos aqui e exporte para .ics quando precisar importar no Google.
        </div>
      </div>

      {/* Navegação */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="btn-ghost p-2"><ChevronLeft className="w-5 h-5"/></button>
          <h2 className="text-lg font-semibold text-gray-900 min-w-48 text-center capitalize">
            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="btn-ghost p-2"><ChevronRight className="w-5 h-5"/></button>
        </div>
        <button onClick={() => setCurrentDate(new Date())} className="btn-secondary btn-sm">Hoje</button>
      </div>

      {loading ? (
        <div className="flex justify-center h-64 items-center"><Loader2 className="w-8 h-8 animate-spin text-brand-600"/></div>
      ) : (
        <>
          {/* Grade do calendário */}
          <div className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
              {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
                <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const evsDia = eventosNoDia(day)
                const isCurrentMonth = isSameMonth(day, currentDate)
                const isTodayDay = isToday(day)
                const dateStr = format(day, 'yyyy-MM-dd')
                const isSelecionado = diaSelecionado === dateStr
                return (
                  <div
                    key={i}
                    onClick={() => { setDiaSelecionado(isSelecionado ? null : dateStr) }}
                    className={`min-h-16 p-1.5 border-b border-r border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${!isCurrentMonth ? 'opacity-30' : ''} ${isSelecionado ? 'bg-brand-50 ring-2 ring-inset ring-brand-300' : ''}`}
                  >
                    <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isTodayDay ? 'bg-brand-600 text-white' : 'text-gray-700'}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {evsDia.slice(0, 3).map(e => (
                        <div key={e.id} className={`text-xs px-1 py-0.5 rounded truncate ${TIPO_COLOR[e.tipo]}`}>
                          {e.hora ? e.hora.substring(0, 5) + ' ' : ''}{e.titulo}
                        </div>
                      ))}
                      {evsDia.length > 3 && <div className="text-xs text-gray-500">+{evsDia.length - 3} mais</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Detalhes do dia selecionado */}
          {diaSelecionado && (
            <div className="mt-4 card">
              <div className="card-header flex items-center justify-between">
                <span className="font-semibold text-gray-900">
                  {format(parseISO(diaSelecionado), "EEEE, d 'de' MMMM", { locale: ptBR })}
                </span>
                <button onClick={() => abrirNovo(diaSelecionado)} className="btn-primary btn-sm"><Plus className="w-3.5 h-3.5"/> Novo evento aqui</button>
              </div>
              {eventosDiaSel.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-500">Nenhum evento neste dia</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {eventosDiaSel.map(e => (
                    <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${TIPO_COLOR[e.tipo]}`}>{TIPO_LABEL[e.tipo]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900">{e.titulo}</div>
                        <div className="text-xs text-gray-500">{e.hora || ''} {e.cliente_nome ? '· ' + e.cliente_nome : ''} {e.responsavel ? '· ' + e.responsavel : ''}</div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => abrirEditar(e)} className="btn-ghost btn-sm p-1.5"><Plus className="w-3.5 h-3.5 rotate-45 opacity-50"/></button>
                        <button onClick={() => remover(e.id)} className="btn-ghost btn-sm p-1.5 text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Legenda */}
      <div className="flex gap-4 mt-4 text-xs flex-wrap">
        {TIPOS.map(t => <span key={t} className={`px-2.5 py-1 rounded-full font-medium ${TIPO_COLOR[t]}`}>{TIPO_LABEL[t]}</span>)}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="text-lg font-semibold">{editId ? 'Editar evento' : 'Novo evento'}</h2>
              <button onClick={() => setModalOpen(false)} className="btn-ghost p-2"><X className="w-5 h-5"/></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group col-span-2"><label className="form-label">Título *</label><input className="input" value={form.titulo} onChange={e => setForm(f=>({...f,titulo:e.target.value}))} placeholder="Ex: Reunião com cliente"/></div>
                <div className="form-group"><label className="form-label">Data</label><input type="date" className="input" value={form.data} onChange={e => setForm(f=>({...f,data:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Horário</label><input type="time" className="input" value={form.hora} onChange={e => setForm(f=>({...f,hora:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Tipo</label><select className="select" value={form.tipo} onChange={e => setForm(f=>({...f,tipo:e.target.value}))}>{TIPOS.map(t=><option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Responsável</label><select className="select" value={form.responsavel} onChange={e => setForm(f=>({...f,responsavel:e.target.value}))}>{COLABS.map(c=><option key={c}>{c}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Cliente</label><input className="input" list="dl-ev" value={form.cliente_nome} onChange={e => setForm(f=>({...f,cliente_nome:e.target.value}))} placeholder="Vincular a um cliente"/><datalist id="dl-ev">{clientes.map(c=><option key={c.id} value={c.nome}/>)}</datalist></div>
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
