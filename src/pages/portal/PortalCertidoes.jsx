import { useEffect, useState } from 'react'
import { usePortalAuth } from '../../contexts/PortalAuthContext'
import { supabase } from '../../lib/supabase'
import { TIPOS_CERTIDAO, statusCertidao, STATUS_LABEL, STATUS_COR, certidoesAtuais } from '../../lib/certidoes'
import { Loader2, Download, ShieldCheck } from 'lucide-react'

function fmtData(d) {
  if (!d) return ''
  return d.split('-').reverse().join('/')
}

export default function PortalCertidoes() {
  const { cliente, marcarSecaoVisitada } = usePortalAuth()
  const [certidoes, setCertidoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [urls, setUrls] = useState({})

  useEffect(() => { if (cliente?.id) { fetchCertidoes(); marcarSecaoVisitada('certidoes') } }, [cliente?.id])

  async function fetchCertidoes() {
    setLoading(true)
    const { data } = await supabase.from('certidoes').select('*').eq('cliente_id', cliente.id)
    setCertidoes(data || [])
    setLoading(false)
  }

  async function baixar(cert) {
    if (urls[cert.id]) { window.open(urls[cert.id], '_blank'); return }
    const { data, error } = await supabase.storage.from('certidoes').createSignedUrl(cert.storage_path, 300)
    if (error || !data) { alert('Não foi possível gerar o link de download.'); return }
    setUrls((prev) => ({ ...prev, [cert.id]: data.signedUrl }))
    window.open(data.signedUrl, '_blank')
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
  }

  const atuais = certidoesAtuais(certidoes)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Certidões Negativas</h1>
        <p className="text-sm text-gray-500 mt-1">Situação das certidões da sua empresa junto ao escritório.</p>
      </div>

      <div className="card">
        <div className="divide-y divide-gray-100">
          {TIPOS_CERTIDAO.map((t) => {
            const atual = atuais[t.id]
            const status = statusCertidao(atual?.data_validade)
            return (
              <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{t.label}</div>
                    {atual?.data_validade && <div className="text-xs text-gray-500">Válida até {fmtData(atual.data_validade)}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${STATUS_COR[status]}`}>{STATUS_LABEL[status]}</span>
                  {atual?.storage_path && (
                    <button onClick={() => baixar(atual)} className="btn-secondary btn-sm gap-1.5"><Download className="w-3.5 h-3.5" /> Baixar</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
