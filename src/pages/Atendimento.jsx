// src/pages/Atendimento.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { buscarColaboradores } from '../lib/colaboradores'
import { Plus, Edit2, Trash2, Search, Loader2, X, Save, Wand2, Copy, Mail } from 'lucide-react'
import { format } from 'date-fns'

const CANAIS = ['whatsapp','email','call','presencial','outro']
const CANAL_LABEL = { whatsapp: '📱 WhatsApp', email: '📧 E-mail', call: '📞 Telefone', presencial: '🤝 Presencial', outro: '💬 Outro' }
const emptyForm = { cliente_nome: '', canal: 'whatsapp', data: format(new Date(), 'yyyy-MM-dd'), responsavel: '', assunto: '', resumo: '', proximo_passo: '' }
const TEMPLATES = [
  { id: 'cobranca', label: '💰 Cobrança', desc: 'Honorário vencido ou a vencer' },
  { id: 'prazo', label: '📅 Aviso de prazo', desc: 'DAS, DCTF, SPED...' },
  { id: 'informativo', label: '📢 Informativo', desc: 'Novidades fiscais' },
  { id: 'boas_vindas', label: '🤝 Boas-vindas', desc: 'Novo cliente' },
  { id: 'documentos', label: '📎 Documentos', desc: 'Solicitar notas, extratos' },
  { id: 'personalizado', label: '✏️ Personalizado', desc: 'Texto livre' },
]

export default function Atendimento() {
  const { isGestor } = useAuth()
  const [aba, setAba] = useState('historico')
  const [atendimentos, setAtendimentos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  // Email IA
  const [template, setTemplate] = useState(null)
  const [emCliente, setEmCliente] = useState('')
  const [emContexto, setEmContexto] = useState('')
  const [emailGerado, setEmailGerado] = useState('')
  const [gerandoEmail, setGerandoEmail] = useState(false)
  const [colabs, setColabs] = useState([])

  useEffect(() => { fetchDados(); buscarColaboradores().then(setColabs) }, [])

  async function fetchDados() {
    setLoading(true)
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from('atendimentos').select('*').order('data', { ascending: false }),
      supabase.from('clientes').select('id,nome,email').order('nome')
    ])
    setAtendimentos(a || []); setClientes(c || [])
    setLoading(false)
  }

  function abrirNovo() { setForm({ ...emptyForm, responsavel: colabs[0] || '' }); setEditId(null); setModalOpen(true) }
  function abrirEditar(a) {
    setForm({ cliente_nome: a.cliente_nome, canal: a.canal, data: a.data, responsavel: a.responsavel, assunto: a.assunto || '', resumo: a.resumo || '', proximo_passo: a.proximo_passo || '' })
    setEditId(a.id); setModalOpen(true)
  }
  async function salvar() {
    if (!form.cliente_nome) return
    setSaving(true)
    const payload = { ...form, data: form.data || null }
    const { error } = editId
      ? await supabase.from('atendimentos').update(payload).eq('id', editId)
      : await supabase.from('atendimentos').insert(payload)
    setSaving(false)
    if (error) { alert(`Erro ao salvar atendimento: ${error.message}`); return }
    setModalOpen(false); fetchDados()
  }
  async function remover(id) {
    if (!window.confirm('Remover este atendimento?')) return
    await supabase.from('atendimentos').delete().eq('id', id); fetchDados()
  }

  async function gerarEmail() {
    if (!template) return
    setGerandoEmail(true)
    const clienteObj = clientes.find(c => c.nome === emCliente)
    const prompts = {
      cobranca: `Escreva um e-mail profissional e cordial de cobrança de honorário contábil para o cliente "${emCliente || '[Cliente]'}". ${emContexto}. Assine como CARSANT CONTABILIDADE — Feira de Santana, BA.`,
      prazo: `Escreva um e-mail de aviso de prazo fiscal para "${emCliente || '[Cliente]'}". ${emContexto}. Seja claro sobre a data e consequências. Assine como CARSANT CONTABILIDADE.`,
      informativo: `Escreva um informativo/circular sobre: ${emContexto}. Para cliente: ${emCliente || 'Prezado(a) cliente'}. Assine como CARSANT CONTABILIDADE.`,
      boas_vindas: `Escreva um e-mail de boas-vindas para o novo cliente "${emCliente}". ${emContexto}. Assine como CARSANT CONTABILIDADE — Feira de Santana, BA.`,
      documentos: `Escreva um e-mail solicitando documentos para "${emCliente || '[Cliente]'}". ${emContexto}. Seja específico e indique o prazo. Assine como CARSANT CONTABILIDADE.`,
      personalizado: `Escreva um e-mail profissional da CARSANT CONTABILIDADE para "${emCliente || '[Cliente]'}". Conteúdo: ${emContexto}.`
    }
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 1000,
          system: 'Você é assistente do escritório CARSANT CONTABILIDADE, Feira de Santana-BA. Gere e-mails profissionais, cordiais e objetivos. Retorne apenas o texto do e-mail.',
          messages: [{ role: 'user', content: prompts[template] }]
        })
      })
      const data = await resp.json()
      setEmailGerado(data.content?.[0]?.text || 'Erro ao gerar. Tente novamente.')
    } catch {
      setEmailGerado('Não foi possível conectar à IA. Verifique sua conexão.')
    }
    setGerandoEmail(false)
  }

  const filtrados = atendimentos.filter(a =>
    (a.cliente_nome || '').toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Atendimento</h1>
          <p className="text-sm text-gray-500 mt-1">Histórico e comunicação com clientes</p>
        </div>
        {aba === 'historico' && <button onClick={abrirNovo} className="btn-primary"><Plus className="w-4 h-4"/> Registrar atendimento</button>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-5 w-fit">
        {[['historico','Histórico'],['email','E-mails com IA']].map(([v,l]) => (
          <button key={v} onClick={() => setAba(v)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${aba === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{l}</button>
        ))}
      </div>

      {aba === 'historico' && <>
        <div className="relative mb-5 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input pl-9" placeholder="Buscar cliente..." value={busca} onChange={e => setBusca(e.target.value)}/>
        </div>
        <div className="table-container">
          {loading ? <div className="flex justify-center h-32 items-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600"/></div> : (
            <table className="table">
              <thead><tr><th>Cliente</th><th>Canal</th><th>Data</th><th>Responsável</th><th>Assunto</th><th>Próximo passo</th><th>Ações</th></tr></thead>
              <tbody>
                {filtrados.map(a => (
                  <tr key={a.id}>
                    <td className="font-medium text-gray-900">{a.cliente_nome}</td>
                    <td><span className="text-sm">{CANAL_LABEL[a.canal] || a.canal}</span></td>
                    <td className="text-gray-600 text-sm">{a.data ? a.data.split('-').reverse().join('/') : '—'}</td>
                    <td className="text-gray-600">{a.responsavel}</td>
                    <td>
                      <div className="font-medium text-sm">{a.assunto}</div>
                      <div className="text-xs text-gray-500 truncate max-w-xs">{a.resumo}</div>
                    </td>
                    <td className="text-sm text-gray-600">{a.proximo_passo || '—'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => abrirEditar(a)} className="btn-ghost btn-sm"><Edit2 className="w-3.5 h-3.5"/></button>
                        <button onClick={() => remover(a.id)} className="btn-ghost btn-sm text-red-500"><Trash2 className="w-3.5 h-3.5"/></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-500">Nenhum atendimento registrado</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </>}

      {aba === 'email' && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {TEMPLATES.map(t => (
              <div key={t.id} onClick={() => setTemplate(t.id)} className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${template === t.id ? 'border-brand-400 bg-brand-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className="font-medium text-sm">{t.label}</div>
                <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
              </div>
            ))}
          </div>
          {template && (
            <div className="card card-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Cliente</label>
                  <input className="input" list="dl-em" value={emCliente} onChange={e => setEmCliente(e.target.value)} placeholder="Nome do cliente"/>
                  <datalist id="dl-em">{clientes.map(c => <option key={c.id} value={c.nome}/>)}</datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">Contexto adicional</label>
                  <input className="input" value={emContexto} onChange={e => setEmContexto(e.target.value)} placeholder="Ex: R$ 300, vencimento dia 20"/>
                </div>
              </div>
              <button onClick={gerarEmail} disabled={gerandoEmail} className="btn-primary">
                {gerandoEmail ? <Loader2 className="w-4 h-4 animate-spin"/> : <Wand2 className="w-4 h-4"/>}
                {gerandoEmail ? 'Gerando...' : 'Gerar e-mail com IA'}
              </button>
              {emailGerado && (
                <div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-mono">{emailGerado}</div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => navigator.clipboard.writeText(emailGerado)} className="btn-secondary btn-sm"><Copy className="w-3.5 h-3.5"/> Copiar</button>
                    <button onClick={() => { const dest = clientes.find(c=>c.nome===emCliente)?.email||''; window.open(`mailto:${dest}?body=${encodeURIComponent(emailGerado)}`) }} className="btn-secondary btn-sm"><Mail className="w-3.5 h-3.5"/> Abrir no e-mail</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="text-lg font-semibold">{editId ? 'Editar atendimento' : 'Registrar atendimento'}</h2>
              <button onClick={() => setModalOpen(false)} className="btn-ghost p-2"><X className="w-5 h-5"/></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group"><label className="form-label">Cliente *</label><input className="input" list="dl-at" value={form.cliente_nome} onChange={e => setForm(f=>({...f,cliente_nome:e.target.value}))}/><datalist id="dl-at">{clientes.map(c=><option key={c.id} value={c.nome}/>)}</datalist></div>
                <div className="form-group"><label className="form-label">Canal</label><select className="select" value={form.canal} onChange={e => setForm(f=>({...f,canal:e.target.value}))}>{CANAIS.map(c=><option key={c} value={c}>{CANAL_LABEL[c]}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Data</label><input type="date" className="input" value={form.data} onChange={e => setForm(f=>({...f,data:e.target.value}))}/></div>
                <div className="form-group"><label className="form-label">Responsável</label><select className="select" value={form.responsavel} onChange={e => setForm(f=>({...f,responsavel:e.target.value}))}>{colabs.map(c=><option key={c}>{c}</option>)}</select></div>
                <div className="form-group col-span-2"><label className="form-label">Assunto</label><input className="input" value={form.assunto} onChange={e => setForm(f=>({...f,assunto:e.target.value}))} placeholder="Ex: Dúvida sobre DAS"/></div>
                <div className="form-group col-span-2"><label className="form-label">Resumo</label><textarea className="textarea" rows={3} value={form.resumo} onChange={e => setForm(f=>({...f,resumo:e.target.value}))} placeholder="O que foi tratado, decisões, encaminhamentos..."/></div>
                <div className="form-group col-span-2"><label className="form-label">Próximo passo</label><input className="input" value={form.proximo_passo} onChange={e => setForm(f=>({...f,proximo_passo:e.target.value}))} placeholder="Ex: Enviar documentos até dia 20"/></div>
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
