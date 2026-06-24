import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, ChevronLeft, ChevronRight, Loader2, X, Save, Trash2, RefreshCw, Calendar, CheckCircle, AlertCircle } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  getGoogleAuthUrl, buscarToken, removerToken,
  criarEventoGoogle, atualizarEventoGoogle, deletarEventoGoogle, buscarEventosGoogle
} from '../lib/googleCalendar'

const TIPOS = ['reuniao','prazo','visita','outro']
const TIPO_LABEL = { reuniao: 'Reunião', prazo: 'Prazo fiscal', visita: 'Visita', outro: 'Outro' }
const TIPO_COLOR = { reuniao: 'bg-blue-100 text-blue-700', prazo: 'bg-red-100 text-red-700', visita: 'bg-yellow-100 text-yellow-700', outro: 'bg-gray-100 text-gray-600' }
const COLABS = ["Ronaldo", "Karine", "Bruno", "Cíntia"]
const emptyForm = { titulo: '', data: format(new Date(), 'yyyy-MM-dd'), hora: '', tipo: 'reuniao', cliente_nome: '', responsavel: 'Ronaldo', obs: '' }

export default function Agenda() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [eventos, setEventos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [diaSelecionado, setDiaSelecionado] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [editGoogleId, setEditGoogleId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [googleConectado, setGoogleConectado] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)

  useEffect(() => {
    fetchDados()
    verificarGoogle()
    // Checar callback OAuth
    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    if (code) {
      window.history.replaceState({}, '', '/agenda')
      handleGoogleCallback(code)
    }
  }, [])

  async function verificarGoogle() {
    const token = await buscarToken()
    setGoogleConectado(!!token?.access_token)
  }

  async function handleGoogleCallback(code) {
    try {
      setSincronizando(true)
      const { trocarCodePorToken, salvarToken } = await import('../lib/googleCalendar')
      const tokenData = await trocarCodePorToken(code)
      await salvarToken(tokenData)
      setGoogleConectado(true)
      mostrarSync('success', 'Google Calendar conectado com sucesso!')
    } catch (e) {
      mostrarSync('error', 'Erro ao conectar Google Calendar')
    } finally {
      setSincronizando(false)
    }
  }

  function conectarGoogle() {
    window.location.href = getGoogleAuthUrl()
  }

  async function desconectarGoogle() {
    await removerToken()
    setGoogleConectado(false)
    mostrarSync('info', 'Google Calendar desconectado')
  }

  function mostrarSync(tipo, msg) {
    setSyncMsg({ tipo, msg })
    setTimeout(() => setSyncMsg(null), 4000)
  }

  async function fetchDados() {
    setLoading(true)
    const [{ data: e }, { data: c }] = await Promise.all([
      supabase.from('eventos').select('*').order('data').order('hora'),
      supabase.from('clientes').select('id,nome').order('nome')
    ])
    setEventos(e || [])
    setClientes(c || [])
    setLoading(false)
  }

  async function sincronizarComGoogle() {
    if (!googleConectado) return
    setSincronizando(true)
    try {
      const inicio = format(startOfMonth(currentDate), 'yyyy-MM-dd')
      const fim = format(endOfMonth(currentDate), 'yyyy-MM-dd')
      const eventosGoogle = await buscarEventosGoogle(inicio, fim)

      // Importar eventos do Google que não existem no sistema
      let importados = 0
      for (const ge of eventosGoogle) {
        const jaExiste = eventos.find(e => e.google_event_id === ge.id)
        if (!jaExiste && ge.summary) {
          const data = ge.start?.date || ge.start?.dateTime?.substring(0, 10)
          const hora = ge.start?.dateTime ? ge.start.dateTime.substring(11, 16) : ''
          await supabase.from('eventos').insert({
            titulo: ge.summary,
            data,
            hora,
            tipo: 'outro',
            obs: ge.description || '',
            google_event_id: ge.id,
            responsavel: 'Ronaldo'
          })
          importados++
        }
      }

      await fetchDados()
      mostrarSync('success', `Sincronizado! ${importados > 0 ? `${importados} evento(s) importado(s) do Google.` : 'Tudo atualizado.'}`)
    } catch (e) {
      mostrarSync('error', 'Erro ao sincronizar com Google Calendar')
    } finally {
      setSincronizando(false)
    }
  }

  function abrirNovo(data = null) {
    setForm({ ...emptyForm, data: data || format(new Date(), 'yyyy-MM-dd') })
    setEditId(null)
    setEditGoogleId(null)
    setModalOpen(true)
  }

  function abrirEditar(e) {
    setForm({ titulo: e.titulo, data: e.data, hora: e.hora || '', tipo: e.tipo, cliente_nome: e.cliente_nome || '', responsavel: e.responsavel, obs: e.obs || '' })
    setEditId(e.id)
    setEditGoogleId(e.google_event_id || null)
    setModalOpen(true)
  }

  async function salvar() {
    if (!form.titulo) return
    setSaving(true)
    try {
      if (editId) {
        await supabase.from('eventos').update(form).eq('id', editId)
        if (googleConectado && editGoogleId) {
          await atualizarEventoGoogle(editGoogleId, form)
        } else if (googleConectado && !editGoogleId) {
          const gId = await criarEventoGoogle(form)
          if (gId) await supabase.from('eventos').update({ google_event_id: gId }).eq('id', editId)
        }
      } else {
        const { data: novo } = await supabase.from('eventos').insert(form).select().single()
        if (googleConectado && novo) {
          const gId = await criarEventoGoogle(form)
          if (gId) await supabase.from('eventos').update({ google_event_id: gId }).eq('id', novo.id)
        }
      }
      setModalOpen(false)
      await fetchDados()
      if (googleConectado) mostrarSync('success', 'Evento salvo e sincronizado com Google Calendar')
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function remover(evento) {
    if (googleConectado && evento.google_event_id) {
      await deletarEventoGoogle(evento.google_event_id)
    }
    await supabase.from('eventos').delete().eq('id', evento.id)
    await fetchDados()
    if (googleConectado) mostrarSync('success', 'Evento removido do sistema e do Google Calendar')
  }

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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-sm text-gray-500 mt-1">{format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Status Google */}
          {googleConectado ? (
            <div className="flex items-center gap-2">
              <button
                onClick={sincronizarComGoogle}
                disabled={sincronizando}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${sincronizando ? 'animate-spin' : ''}`} />
                {sincronizando ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              <button
                onClick={desconectarGoogle}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-100 transition-colors"
              >
                <CheckCircle className="w-4 h-4 text-green-500" />
                Google conectado
              </button>
            </div>
          ) : (
            <button
              onClick={conectarGoogle}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Calendar className="w-4 h-4 text-blue-500" />
              Conectar Google Calendar
            </button>
          )}
          <button onClick={() => abrirNovo()} className="btn-primary"><Plus className="w-4 h-4"/> Novo evento</button>
        </div>
      </div>

      {/* Mensagem de sincronização */}
      {syncMsg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm flex items-center gap-2 ${
          syncMsg.tipo === 'success' ? 'bg-green-50 border border-green-200 text-green-700' :
          syncMsg.tipo === 'error' ? 'bg-red-50 border border-red-200 text-red-700' :
          'bg-blue-50 border border-blue-200 text-blue-700'
        }`}>
          {syncMsg.tipo === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {syncMsg.msg}
        </div>
      )}

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
                    onClick={() => setDiaSelecionado(isSelecionado ? null : dateStr)}
                    className={`min-h-16 p-1.5 border-b border-r border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${!isCurrentMonth ? 'opacity-30' : ''} ${isSelecionado ? 'bg-brand-50 ring-2 ring-inset ring-brand-300' : ''}`}
                  >
                    <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isTodayDay ? 'bg-brand-600 text-white' : 'text-gray-700'}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-0.5">
                      {evsDia.slice(0, 3).map(e => (
                        <div key={e.id} className={`text-xs px-1 py-0.5 rounded truncate flex items-center gap-1 ${TIPO_COLOR[e.tipo]}`}>
                          {e.google_event_id && <span className="text-[8px]">🔵</span>}
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
                        <div className="font-medium text-sm text-gray-900 flex items-center gap-1.5">
                          {e.titulo}
                          {e.google_event_id && <span className="text-xs text-blue-500" title="Sincronizado com Google Calendar">🔵</span>}
                        </div>
                        <div className="text-xs text-gray-500">{e.hora || ''} {e.cliente_nome ? '· ' + e.cliente_nome : ''} {e.responsavel ? '· ' + e.responsavel : ''}</div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => abrirEditar(e)} className="btn-ghost btn-sm p-1.5"><Plus className="w-3.5 h-3.5 rotate-45 opacity-50"/></button>
                        <button onClick={() => remover(e)} className="btn-ghost btn-sm p-1.5 text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex gap-4 mt-4 text-xs flex-wrap items-center">
        {TIPOS.map(t => <span key={t} className={`px-2.5 py-1 rounded-full font-medium ${TIPO_COLOR[t]}`}>{TIPO_LABEL[t]}</span>)}
        {googleConectado && <span className="text-gray-500 ml-2">🔵 = sincronizado com Google</span>}
      </div>

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
              {googleConectado && (
                <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Este evento será sincronizado automaticamente com Google Calendar
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="btn-primary">{saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} Salvar{googleConectado ? ' e sincronizar' : ''}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
