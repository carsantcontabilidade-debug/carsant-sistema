// src/pages/ContasPagar.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Plus, CheckCircle, RefreshCw, Edit2, Trash2, Search, Loader2, X, Save, Upload, Paperclip, FileSearch } from 'lucide-react'
import { analisarXmlNota, analisarPdfBoleto, PdfProtegidoPorSenha } from '../lib/importarConta'

const CATEGORIAS = ['Aluguel','Salários / Pró-labore','Sistemas / Softwares','Contador','Energia / Água / Internet','Impostos','Comissões','Outras']
const MES_NOMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const emptyForm = { descricao: '', categoria: '', valor: '', dia_vencimento: 10, fornecedor: '', recorrencia: 'mensal', obs: '' }
const emptyImportForm = { descricao: '', categoria: '', valor: '', dia_vencimento: 10, fornecedor: '', recorrencia: 'unica', obs: '' }

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

  // Importação automática (XML de nota fiscal / PDF de boleto)
  const [modalImportarOpen, setModalImportarOpen] = useState(false)
  const [arquivoImportado, setArquivoImportado] = useState(null)
  const [analisando, setAnalisando] = useState(false)
  const [formImportar, setFormImportar] = useState(emptyImportForm)
  const [avisoImportacao, setAvisoImportacao] = useState('')
  const [textoExtraidoPdf, setTextoExtraidoPdf] = useState('')
  const [salvandoImportacao, setSalvandoImportacao] = useState(false)

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

  function abrirImportar() {
    setArquivoImportado(null)
    setFormImportar(emptyImportForm)
    setAvisoImportacao('')
    setTextoExtraidoPdf('')
    setModalImportarOpen(true)
  }

  // Dia do vencimento extraído (AAAA-MM-DD) vira só o número do dia —
  // despesas guarda um "dia do mês" recorrente, não uma data completa.
  function diaDoVencimento(dataIso) {
    if (!dataIso) return 10
    const dia = Number(dataIso.slice(8, 10))
    return dia >= 1 && dia <= 31 ? dia : 10
  }

  async function processarArquivo(file) {
    if (!file) return
    setArquivoImportado(file)
    setAnalisando(true)
    setAvisoImportacao('')
    try {
      const ehXml = /\.xml$/i.test(file.name)
      const ehPdf = /\.pdf$/i.test(file.name)
      if (ehXml) {
        const texto = await file.text()
        const dados = analisarXmlNota(texto)
        setFormImportar({
          descricao: dados.descricao,
          categoria: '',
          valor: dados.valor ?? '',
          dia_vencimento: diaDoVencimento(dados.vencimento || dados.dataEmissao),
          fornecedor: dados.cnpj ? `${dados.fornecedor} (${dados.cnpj})` : dados.fornecedor,
          recorrencia: 'unica',
          obs: '',
        })
        if (!dados.valor) setAvisoImportacao('Não consegui encontrar o valor no XML — confira antes de salvar.')
      } else if (ehPdf) {
        const buffer = await file.arrayBuffer()
        let senha
        let dados
        for (let tentativa = 0; tentativa < 3; tentativa++) {
          try {
            dados = await analisarPdfBoleto(buffer, senha)
            break
          } catch (err) {
            if (!(err instanceof PdfProtegidoPorSenha)) throw err
            senha = window.prompt(
              tentativa === 0
                ? 'Este PDF está protegido por senha. Digite a senha (em faturas de empresa, geralmente é o CNPJ, só números ou com pontuação):'
                : 'Senha incorreta. Tente de novo (ou cancele pra preencher manualmente):'
            )
            if (!senha) { setAvisoImportacao('PDF protegido por senha — preencha os dados manualmente abaixo.'); return }
          }
        }
        if (!dados) { setAvisoImportacao('Não foi possível abrir este PDF (senha incorreta muitas vezes) — preencha manualmente.'); return }

        setFormImportar({
          descricao: dados.fornecedor ? `Boleto — ${dados.fornecedor}` : 'Boleto',
          categoria: '',
          valor: dados.valor ?? '',
          dia_vencimento: diaDoVencimento(dados.vencimento),
          fornecedor: dados.cnpj ? `${dados.fornecedor} (${dados.cnpj})` : dados.fornecedor,
          recorrencia: 'unica',
          obs: '',
        })
        setTextoExtraidoPdf(dados.textoExtraido || '')
        const avisos = []
        if (!dados.linhaDigitavel) avisos.push('Não encontrei a linha digitável neste PDF — confira o valor e o vencimento manualmente.')
        else if (dados.tipoBoleto === 'arrecadacao' && !dados.vencimento) avisos.push('Esta é uma guia de arrecadação (FGTS/INSS/tributo) — o vencimento não vem no código de barras, confira a data no documento.')
        if (!dados.fornecedor) avisos.push('Não consegui identificar o fornecedor — preencha manualmente.')
        setAvisoImportacao(avisos.join(' '))
      } else {
        setAvisoImportacao('Formato não reconhecido — anexe um arquivo .xml (nota fiscal) ou .pdf (boleto).')
      }
    } catch (err) {
      setAvisoImportacao(`Não consegui ler este arquivo automaticamente: ${err.message}. Preencha manualmente abaixo.`)
    } finally {
      setAnalisando(false)
    }
  }

  async function salvarImportacao() {
    if (!formImportar.descricao) { alert('Preencha a descrição.'); return }
    setSalvandoImportacao(true)
    try {
      let storage_path = null
      let nome_arquivo = null
      if (arquivoImportado) {
        const path = `${Date.now()}_${arquivoImportado.name.replace(/[^\w.\-]/g, '_')}`
        const { error: uploadError } = await supabase.storage.from('contas-pagar-anexos').upload(path, arquivoImportado)
        if (uploadError) throw uploadError
        storage_path = path
        nome_arquivo = arquivoImportado.name
      }
      const payload = {
        ...formImportar,
        valor: parseFloat(formImportar.valor) || 0,
        dia_vencimento: parseInt(formImportar.dia_vencimento) || 10,
        storage_path,
        nome_arquivo,
      }
      const { error } = await supabase.from('despesas').insert(payload)
      if (error) throw error
      setModalImportarOpen(false)
      fetchDados()
    } catch (err) {
      alert(`Erro ao salvar: ${err.message}`)
    } finally {
      setSalvandoImportacao(false)
    }
  }

  async function verAnexo(d) {
    if (!d.storage_path) return
    const { data, error } = await supabase.storage.from('contas-pagar-anexos').createSignedUrl(d.storage_path, 300)
    if (error || !data) { alert('Não foi possível abrir o anexo.'); return }
    window.open(data.signedUrl, '_blank')
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
          {isGestor && <button onClick={abrirImportar} className="btn-secondary gap-1.5"><Upload className="w-4 h-4" /> Importar arquivo</button>}
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
                        {d.storage_path && (
                          <button onClick={() => verAnexo(d)} className="btn-ghost btn-sm text-gray-500" title="Ver arquivo anexado"><Paperclip className="w-3.5 h-3.5"/></button>
                        )}
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

      {modalImportarOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalImportarOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="text-lg font-semibold">Importar arquivo</h2>
              <button onClick={() => setModalImportarOpen(false)} className="btn-ghost p-2"><X className="w-5 h-5"/></button>
            </div>
            <div className="modal-body space-y-4">
              <div className="form-group">
                <label className="form-label">Nota fiscal (.xml) ou boleto (.pdf)</label>
                <input
                  type="file"
                  accept=".xml,.pdf,application/xml,text/xml,application/pdf"
                  className="input"
                  onChange={e => processarArquivo(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-gray-500 mt-1">FGTS, INSS, água, luz, telefone, internet, plano de saúde, nota fiscal de fornecedor...</p>
              </div>

              {analisando && (
                <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Lendo o arquivo...</div>
              )}

              {avisoImportacao && !analisando && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-3 py-2 text-xs flex items-start gap-2">
                  <FileSearch className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{avisoImportacao}</span>
                </div>
              )}

              {textoExtraidoPdf && !analisando && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Ver texto lido do PDF (diagnóstico)</summary>
                  <pre className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px]">{textoExtraidoPdf}</pre>
                </details>
              )}

              {arquivoImportado && !analisando && (
                <>
                  <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">Confira os dados abaixo antes de salvar — a leitura automática pode não ser perfeita.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group col-span-2"><label className="form-label">Descrição *</label><input className="input" value={formImportar.descricao} onChange={e => setFormImportar(f=>({...f,descricao:e.target.value}))} /></div>
                    <div className="form-group"><label className="form-label">Categoria</label><select className="select" value={formImportar.categoria} onChange={e => setFormImportar(f=>({...f,categoria:e.target.value}))}><option value="">Selecione...</option>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
                    <div className="form-group"><label className="form-label">Valor (R$)</label><input type="number" className="input" value={formImportar.valor} onChange={e => setFormImportar(f=>({...f,valor:e.target.value}))}/></div>
                    <div className="form-group"><label className="form-label">Dia vencimento</label><input type="number" min={1} max={31} className="input" value={formImportar.dia_vencimento} onChange={e => setFormImportar(f=>({...f,dia_vencimento:e.target.value}))}/></div>
                    <div className="form-group"><label className="form-label">Fornecedor</label><input className="input" value={formImportar.fornecedor} onChange={e => setFormImportar(f=>({...f,fornecedor:e.target.value}))} /></div>
                    <div className="form-group"><label className="form-label">Recorrência</label><select className="select" value={formImportar.recorrencia} onChange={e => setFormImportar(f=>({...f,recorrencia:e.target.value}))}><option value="mensal">Mensal</option><option value="unica">Única</option><option value="eventual">Eventual</option></select></div>
                    <div className="form-group"><label className="form-label">Observação</label><input className="input" value={formImportar.obs} onChange={e => setFormImportar(f=>({...f,obs:e.target.value}))}/></div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalImportarOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={salvarImportacao} disabled={salvandoImportacao || !arquivoImportado || analisando} className="btn-primary">
                {salvandoImportacao ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} Salvar despesa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
