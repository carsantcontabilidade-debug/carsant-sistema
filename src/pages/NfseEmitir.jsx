import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Loader2, FileText, AlertTriangle, Search } from 'lucide-react'

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
  tomadorTelefone: '',
  tomadorLogradouro: 'Avenida Getúlio Vargas',
  tomadorNumero: '2761',
  tomadorBairro: 'Santa Mônica',
  tomadorCep: '44001525',
}

const emptyConsulta = {
  tipo: 'porFaixa',
  numeroInicial: '1',
  numeroFinal: '',
  dataInicial: new Date().toISOString().slice(0, 7) + '-01',
  dataFinal: new Date().toISOString().slice(0, 10),
  tomadorCnpj: '',
}

export default function NfseEmitir() {
  const { profile } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  const [consulta, setConsulta] = useState(emptyConsulta)
  const [consultando, setConsultando] = useState(false)
  const [resultadoConsulta, setResultadoConsulta] = useState(null)
  const [erroConsulta, setErroConsulta] = useState('')

  if (profile?.role !== 'gestor') {
    return <div className="p-8 text-center text-gray-500">Acesso restrito ao gestor.</div>
  }

  async function consultar(e) {
    e.preventDefault()
    setErroConsulta('')
    setResultadoConsulta(null)
    setConsultando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const filtros = consulta.tipo === 'porFaixa'
        ? {
            numeroInicial: consulta.numeroInicial,
            numeroFinal: consulta.numeroFinal || undefined,
          }
        : {
            periodoEmissao: { inicial: consulta.dataInicial, final: consulta.dataFinal },
            tomadorCnpj: consulta.tomadorCnpj.replace(/\D/g, '') || undefined,
          }
      const resp = await fetch('/api/nfse-consultar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ ambiente: 'homologacao', tipo: consulta.tipo, filtros }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Falha ao consultar NFS-e')
      setResultadoConsulta(data)
    } catch (err) {
      setErroConsulta(err.message)
    } finally {
      setConsultando(false)
    }
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
              telefone: form.tomadorTelefone.replace(/\D/g, '') || undefined,
              endereco: {
                logradouro: form.tomadorLogradouro,
                numero: form.tomadorNumero,
                bairro: form.tomadorBairro,
                cep: form.tomadorCep.replace(/\D/g, ''),
                uf: 'BA',
                codigoMunicipioIbge: '2910800',
                codigoPais: '1058',
              },
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
            <div className="form-group">
              <label className="form-label">E-mail (seu, para teste)</label>
              <input type="email" className="input" value={form.tomadorEmail} onChange={e => setForm(f => ({ ...f, tomadorEmail: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="input" value={form.tomadorTelefone} onChange={e => setForm(f => ({ ...f, tomadorTelefone: e.target.value }))} placeholder="75999999999" />
            </div>
            <div className="form-group col-span-2">
              <label className="form-label">Logradouro</label>
              <input className="input" value={form.tomadorLogradouro} onChange={e => setForm(f => ({ ...f, tomadorLogradouro: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Número</label>
              <input className="input" value={form.tomadorNumero} onChange={e => setForm(f => ({ ...f, tomadorNumero: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Bairro</label>
              <input className="input" value={form.tomadorBairro} onChange={e => setForm(f => ({ ...f, tomadorBairro: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">CEP</label>
              <input className="input" value={form.tomadorCep} onChange={e => setForm(f => ({ ...f, tomadorCep: e.target.value }))} />
            </div>
            <div className="form-group flex items-end">
              <p className="text-xs text-gray-500">Cidade/UF/País fixos em Feira de Santana/BA/Brasil para este teste.</p>
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

      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Consultar NFS-e emitidas</h2>
        <p className="text-sm text-gray-500 mb-4">Útil para descobrir o próximo número de RPS a usar e para conferir notas já emitidas.</p>

        <form onSubmit={consultar} className="card p-5 space-y-4">
          <div className="form-group">
            <label className="form-label">Tipo de consulta</label>
            <select
              className="select"
              value={consulta.tipo}
              onChange={e => setConsulta(c => ({ ...c, tipo: e.target.value }))}
            >
              <option value="porFaixa">Por número (faixa)</option>
              <option value="porPeriodo">Por período de emissão</option>
            </select>
          </div>

          {consulta.tipo === 'porFaixa' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Número inicial</label>
                <input className="input" value={consulta.numeroInicial} onChange={e => setConsulta(c => ({ ...c, numeroInicial: e.target.value.replace(/\D/g, '') }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Número final (opcional)</label>
                <input className="input" value={consulta.numeroFinal} onChange={e => setConsulta(c => ({ ...c, numeroFinal: e.target.value.replace(/\D/g, '') }))} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Data inicial</label>
                <input type="date" className="input" value={consulta.dataInicial} onChange={e => setConsulta(c => ({ ...c, dataInicial: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Data final</label>
                <input type="date" className="input" value={consulta.dataFinal} onChange={e => setConsulta(c => ({ ...c, dataFinal: e.target.value }))} />
              </div>
              <div className="form-group col-span-2">
                <label className="form-label">CNPJ do tomador (opcional, filtra por cliente)</label>
                <input
                  className="input"
                  value={consulta.tomadorCnpj}
                  onChange={e => setConsulta(c => ({ ...c, tomadorCnpj: e.target.value.replace(/\D/g, '').slice(0, 14) }))}
                  maxLength={14}
                />
              </div>
            </div>
          )}

          {erroConsulta && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              <div className="whitespace-pre-wrap break-words">{erroConsulta}</div>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(erroConsulta)}
                className="mt-2 text-xs font-medium text-red-800 underline"
              >
                Copiar erro completo
              </button>
            </div>
          )}

          <button type="submit" disabled={consultando} className="btn-primary gap-2">
            {consultando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {consultando ? 'Consultando...' : 'Consultar'}
          </button>
        </form>

        {resultadoConsulta && (
          <div className="card p-5 mt-4">
            <h3 className="text-sm font-semibold text-green-700 mb-3">✅ Resposta do WebISS ({resultadoConsulta.ambiente})</h3>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap">{resultadoConsulta.resultadoXml}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
