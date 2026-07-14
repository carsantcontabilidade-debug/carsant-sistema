import { useEffect, useState } from 'react'
import { usePortalAuth } from '../../contexts/PortalAuthContext'
import { supabase } from '../../lib/supabase'
import { Loader2, CheckCircle, Clock, AlertCircle, Copy, FileText } from 'lucide-react'

const MES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const STATUS_COBRANCA = {
  pendente: { label: 'Pendente', cor: 'bg-gray-100 text-gray-600' },
  gerada: { label: 'Gerada', cor: 'bg-blue-100 text-blue-700' },
  paga: { label: 'Paga', cor: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', cor: 'bg-red-100 text-red-700' },
  vencida: { label: 'Vencida', cor: 'bg-orange-100 text-orange-700' },
  erro: { label: 'Erro', cor: 'bg-red-100 text-red-600' },
}

function fmtValor(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export default function PortalHonorarios() {
  const { cliente } = usePortalAuth()
  const [pagamentos, setPagamentos] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (cliente?.id) fetchDados() }, [cliente?.id])

  async function fetchDados() {
    setLoading(true)
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('pagamentos_honorarios').select('*').eq('cliente_id', cliente.id).order('ano', { ascending: false }).order('mes', { ascending: false }).limit(12),
      supabase.from('cobrancas').select('*').eq('cliente_id', cliente.id).order('created_at', { ascending: false }).limit(50),
    ])
    setPagamentos(p || [])
    setCobrancas(c || [])
    setLoading(false)
  }

  function copiar(texto) {
    navigator.clipboard.writeText(texto)
    alert('Copiado!')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
  }

  const cobrancasAbertas = cobrancas.filter(c => c.status !== 'paga' && c.status !== 'cancelada')

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Honorários & Cobranças</h1>
        <p className="text-sm text-gray-500 mt-1">Honorário mensal: {fmtValor(cliente?.valor_honorario)} — vencimento todo dia {cliente?.dia_vencimento || 10}</p>
      </div>

      {cobrancasAbertas.length > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="font-semibold text-gray-900">Em aberto</h2></div>
          <div className="divide-y divide-gray-100">
            {cobrancasAbertas.map(c => (
              <div key={c.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium text-gray-900">{c.descricao || 'Cobrança'}</div>
                    <div className="text-xs text-gray-500">Vencimento: {fmtData(c.vencimento)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{fmtValor(c.valor)}</div>
                    <span className={`badge ${STATUS_COBRANCA[c.status]?.cor || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_COBRANCA[c.status]?.label || c.status}
                    </span>
                  </div>
                </div>
                {(c.pix_copia_cola || c.link_boleto) && (
                  <div className="flex gap-2 mt-2">
                    {c.pix_copia_cola && (
                      <button onClick={() => copiar(c.pix_copia_cola)} className="btn-secondary btn-sm gap-1.5">
                        <Copy className="w-3.5 h-3.5" /> Copiar Pix
                      </button>
                    )}
                    {c.link_boleto && (
                      <a href={c.link_boleto} target="_blank" rel="noreferrer" className="btn-secondary btn-sm gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> Ver boleto
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Histórico de honorários</h2></div>
        <table className="table">
          <thead><tr><th>Mês</th><th>Status</th><th>Pago em</th></tr></thead>
          <tbody>
            {pagamentos.map(p => (
              <tr key={p.id}>
                <td>{MES_NOMES[p.mes]} {p.ano}</td>
                <td>
                  {p.pago
                    ? <span className="badge-blue flex items-center gap-1 w-fit"><CheckCircle className="w-3.5 h-3.5" /> Pago</span>
                    : <span className="badge-gray flex items-center gap-1 w-fit"><Clock className="w-3.5 h-3.5" /> Pendente</span>}
                </td>
                <td>{fmtData(p.data_pagamento)}</td>
              </tr>
            ))}
            {pagamentos.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-gray-500">Nenhum registro ainda</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="font-semibold text-gray-900">Histórico de cobranças</h2></div>
        <table className="table">
          <thead><tr><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead>
          <tbody>
            {cobrancas.map(c => (
              <tr key={c.id}>
                <td>{c.descricao || '—'}</td>
                <td>{fmtValor(c.valor)}</td>
                <td>{fmtData(c.vencimento)}</td>
                <td><span className={`badge ${STATUS_COBRANCA[c.status]?.cor || 'bg-gray-100 text-gray-600'}`}>{STATUS_COBRANCA[c.status]?.label || c.status}</span></td>
              </tr>
            ))}
            {cobrancas.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-500">
                <AlertCircle className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                Nenhuma cobrança encontrada
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
