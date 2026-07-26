import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SETORES } from '../lib/chat'
import { Loader2, UserPlus, Download, Mail } from 'lucide-react'

const ROLE_LABEL = { gestor: 'Gestor', colaborador: 'Colaborador' }

export default function Configuracoes() {
  const [colaboradores, setColaboradores] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nome: '', email: '', role: 'colaborador', setor: '' })
  const [convidando, setConvidando] = useState(false)
  const [mensagem, setMensagem] = useState(null)
  const [salvandoId, setSalvandoId] = useState(null)
  const [baixandoBackup, setBaixandoBackup] = useState(false)

  useEffect(() => { carregarColaboradores() }, [])

  async function carregarColaboradores() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('nome')
    setColaboradores(data || [])
    setLoading(false)
  }

  async function convidar(e) {
    e.preventDefault()
    setConvidando(true)
    setMensagem(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/staff-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(form),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao cadastrar usuário.')
      setMensagem({ tipo: 'sucesso', texto: `Convite enviado para ${form.email}.` })
      setForm({ nome: '', email: '', role: 'colaborador', setor: '' })
      carregarColaboradores()
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: err.message })
    } finally {
      setConvidando(false)
    }
  }

  async function atualizarColaborador(id, campos) {
    setSalvandoId(id)
    const { error } = await supabase.from('profiles').update(campos).eq('id', id)
    if (error) alert(`Não foi possível salvar: ${error.message}`)
    else setColaboradores((atual) => atual.map((c) => (c.id === id ? { ...c, ...campos } : c)))
    setSalvandoId(null)
  }

  async function baixarBackup() {
    setBaixandoBackup(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/backup', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || 'Falha ao gerar backup.')
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carsant-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err.message)
    } finally {
      setBaixandoBackup(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">⚙️ Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Cadastro de usuários da equipe e backup do sistema.</p>
      </div>

      {/* Cadastro de usuários */}
      <div className="card">
        <div className="card-header flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Cadastrar novo usuário</h2>
        </div>
        <form onSubmit={convidar} className="p-4 flex flex-wrap items-end gap-3">
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input className="input" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="select" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="colaborador">Colaborador</option>
              <option value="gestor">Gestor</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Setor (chat)</label>
            <select className="select" value={form.setor} onChange={(e) => setForm((f) => ({ ...f, setor: e.target.value }))}>
              <option value="">— nenhum —</option>
              {Object.entries(SETORES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </select>
          </div>
          <button type="submit" disabled={convidando} className="btn-primary gap-1.5">
            {convidando ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {convidando ? 'Enviando...' : 'Cadastrar e convidar'}
          </button>
        </form>
        {mensagem && (
          <div className={`mx-4 mb-4 px-4 py-3 rounded-lg text-sm ${mensagem.tipo === 'sucesso' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {mensagem.texto}
          </div>
        )}
      </div>

      {/* Lista de colaboradores */}
      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Equipe</h2></div>
        {loading ? (
          <div className="flex items-center justify-center h-24"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>
        ) : (
          <div className="divide-y divide-gray-100">
            {colaboradores.map((c) => (
              <div key={c.id} className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-40">
                  <div className="font-medium text-gray-900">{c.nome}</div>
                  <div className="text-xs text-gray-500">{c.email}</div>
                </div>
                <select
                  className="select"
                  value={c.role}
                  disabled={salvandoId === c.id}
                  onChange={(e) => atualizarColaborador(c.id, { role: e.target.value })}
                >
                  <option value="colaborador">Colaborador</option>
                  <option value="gestor">Gestor</option>
                </select>
                <select
                  className="select"
                  value={c.setor || ''}
                  disabled={salvandoId === c.id}
                  onChange={(e) => atualizarColaborador(c.id, { setor: e.target.value || null })}
                >
                  <option value="">— nenhum setor —</option>
                  {Object.entries(SETORES).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
                </select>
              </div>
            ))}
            {colaboradores.length === 0 && <div className="text-center py-8 text-gray-500">Nenhum usuário cadastrado</div>}
          </div>
        )}
      </div>

      {/* Backup */}
      <div className="card">
        <div className="card-header flex items-center gap-2">
          <Download className="w-4 h-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900">Backup do sistema</h2>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600">
            Baixe agora uma cópia completa dos dados (clientes, honorários, cobranças, notas fiscais, documentos, tarefas, comunicações) em um arquivo JSON.
            Além disso, todo início de semana um backup automático é enviado por e-mail para <strong>carsantcontabilidade@gmail.com</strong>,
            independente do acesso à conta do Supabase.
          </p>
          <button onClick={baixarBackup} disabled={baixandoBackup} className="btn-primary gap-1.5">
            {baixandoBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {baixandoBackup ? 'Gerando...' : 'Baixar backup agora'}
          </button>
          <p className="text-xs text-gray-400 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Backup semanal automático: toda segunda-feira de madrugada.</p>
        </div>
      </div>
    </div>
  )
}
