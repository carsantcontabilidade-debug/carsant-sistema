import { usePortalAuth } from '../../contexts/PortalAuthContext'
import { Wallet, FolderOpen, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function PortalHome() {
  const { cliente } = usePortalAuth()

  const atalhos = [
    { to: '/portal/honorarios', icon: Wallet, label: 'Honorários & Cobranças', desc: 'Veja seu status de pagamento e cobranças em aberto' },
    { to: '/portal/documentos', icon: FolderOpen, label: 'Documentos', desc: 'Envie notas fiscais e baixe guias, folha e relatórios' },
    { to: '/portal/comunicacao', icon: MessageCircle, label: 'Comunicação', desc: 'Veja o histórico de mensagens com o escritório' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {cliente?.nome?.split(' ')[0] || 'bem-vindo(a)'}!</h1>
        <p className="text-sm text-gray-500 mt-1">Bem-vindo ao Portal do Cliente da CARSANT Contabilidade.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {atalhos.map(a => (
          <Link key={a.to} to={a.to} className="card p-5 hover:shadow-md transition-shadow">
            <a.icon className="w-6 h-6 text-brand-600 mb-3" />
            <div className="font-semibold text-gray-900 mb-1">{a.label}</div>
            <div className="text-sm text-gray-500">{a.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
