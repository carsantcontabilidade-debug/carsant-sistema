import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, FileText, AlertTriangle } from 'lucide-react'

const emptyForm = {
  rpsNumero: '1',
  rpsSerie: '1',
  competencia: new Date().toISOString().slice(0, 10),
  valorServicos: '',
  itemListaServico: '1719',
  discriminacao: '',
  tomadorNome: '',
  tomadorCnpj: '',
  tomadorEmail: '',
}

export default function NfseEmitir() {
  const { profile } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  if (profile?.role !== 'gestor') {
    return <div className="p-8 text-center text-gray-500">Acesso restrito ao gestor.</div>
  }

  async function emitir(e) {
    e.preventDefault()
    setErro('')
    setResultado(null)

    const cnpjLimpo = form.tomadorCnpj.replace(/\D/g, '')
    if (cnpjLimpo && cnpjLimpo.length !== 14) {
      setErro(`O CNPJ do tomador precisa ter exatamente 14 dígitos (tem ${cnpjLimpo.length}). O WebISS exige esse tamanho exato — evite gastar tentativas testando um valor errado.`)
      return
    }

    setEnviando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/nfse-emitir', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          ambiente: 'homologacao',
          dados: {
            rpsNumero: form.rpsNumero,
            rpsSerie: form.rpsSerie,
            competencia: form.competencia,
            valorServicos: parseFloat(form.valorServicos) || 0,
            itemListaServico: form.itemListaServico,
            discriminacao: form.discriminacao,
            tomador: {
              razaoSocial: form.tomadorNome || undefined,
              cnpj: cnpjLimpo || undefined,
              email: form.tomadorEmail || undefined,
            },
          },
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao emitir NFS-e')
      setResultado(data)
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Emitir NFS-e — WebISS</h1>
        <p className="text-sm text-gray-500 mt-1">Integração direta com a Prefeitura de Feira de Santana (padrão ABRASF 2.02).</p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-yellow-800">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <span>Ambiente fixo em <strong>HOMOLOGAÇÃO</strong> (teste) por enquanto — nenhuma nota fiscal real é emitida aqui.</span>
      </div>

      <form onSubmit={emitir} className="card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="form-label">Número do RPS</label>
            <input className="input" value={form.rpsNumero} onChange={e => setForm(f => ({ ...f, rpsNumero: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Série</label>
            <input className="input" value={form.rpsSerie} onChange={e => setForm(f => ({ ...f, rpsSerie: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Competência</label>
            <input type="date" className="input" value={form.competencia} onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Valor dos Serviços (R$)</label>
            <input type="number" step="0.01" className="input" value={form.valorServicos} onChange={e => setForm(f => ({ ...f, valorServicos: e.target.value }))} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Discriminação do serviço</label>
          <textarea className="textarea" rows={2} value={form.discriminacao} onChange={e => setForm(f => ({ ...f, discriminacao: e.target.value }))} placeholder="Ex: Serviços de contabilidade — teste de homologação" />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Tomador (dados fictícios para teste)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Nome / Razão social</label>
              <input className="input" value={form.tomadorNome} onChange={e => setForm(f => ({ ...f, tomadorNome: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">CNPJ (fictício)</label>
              <input
                className="input"
                value={form.tomadorCnpj}
                onChange={e => setForm(f => ({ ...f, tomadorCnpj: e.target.value.replace(/\D/g, '').slice(0, 14) }))}
                placeholder="11222333000181 (14 dígitos)"
                maxLength={14}
              />
            </div>
            <div className="form-group col-span-2">
              <label className="form-label">E-mail (seu, para teste)</label>
              <input type="email" className="input" value={form.tomadorEmail} onChange={e => setForm(f => ({ ...f, tomadorEmail: e.target.value }))} />
            </div>
          </div>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <div className="whitespace-pre-wrap break-words">{erro}</div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(erro)}
              className="mt-2 text-xs font-medium text-red-800 underline"
            >
              Copiar erro completo
            </button>
          </div>
        )}

        <button type="submit" disabled={enviando} className="btn-primary gap-2">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {enviando ? 'Enviando ao WebISS...' : 'Emitir NFS-e (Homologação)'}
        </button>
      </form>

      {resultado && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-green-700 mb-3">✅ Resposta do WebISS ({resultado.ambiente})</h3>
          <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap">{resultado.resultadoXml}</pre>
        </div>
      )}
    </div>
  )
}
