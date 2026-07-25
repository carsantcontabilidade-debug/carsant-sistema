import { useEffect, useState } from 'react'
import { usePortalAuth } from '../../contexts/PortalAuthContext'
import { Wallet, FolderOpen, MessageCircle, Bell, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { pushSuportado, inscreverPush } from '../../lib/push'

export default function PortalHome() {
  const { cliente, contadores } = usePortalAuth()
  const [notifStatus, setNotifStatus] = useState('indisponivel') // indisponivel | pedir | ativo | negado
  const [ativando, setAtivando] = useState(false)

  useEffect(() => {
    checarStatusNotificacoes()
  }, [])

  async function checarStatusNotificacoes() {
    if (!pushSuportado()) return
    if (Notification.permission === 'denied') { setNotifStatus('negado'); return }
    if (Notification.permission !== 'granted') { setNotifStatus('pedir'); return }
    // Permissão concedida não significa que a inscrição foi salva com sucesso
    // (ex: chave VAPID inválida na hora) — confirma se existe assinatura ativa.
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      setNotifStatus(sub ? 'ativo' : 'pedir')
    } catch {
      setNotifStatus('pedir')
    }
  }

  async function ativarNotificacoes() {
    setAtivando(true)
    try {
      await inscreverPush(cliente.id)
      setNotifStatus('ativo')
    } catch (err) {
      setNotifStatus(Notification.permission === 'denied' ? 'negado' : 'pedir')
      alert(err.message)
    } finally {
      setAtivando(false)
    }
  }

  const atalhos = [
    { to: '/portal/honorarios', icon: Wallet, label: 'Honorários & Cobranças', desc: 'Veja seu status de pagamento e cobranças em aberto', secao: 'honorarios' },
    { to: '/portal/documentos', icon: FolderOpen, label: 'Documentos', desc: 'Envie notas fiscais e baixe guias, folha e relatórios', secao: 'documentos' },
    { to: '/portal/comunicacao', icon: MessageCircle, label: 'Comunicação', desc: 'Veja o histórico de mensagens com o escritório', secao: 'comunicacao' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {cliente?.nome?.split(' ')[0] || 'bem-vindo(a)'}!</h1>
        <p className="text-sm text-gray-500 mt-1">Bem-vindo ao Portal do Cliente da CARSANT Contabilidade.</p>
      </div>

      {notifStatus === 'pedir' && (
        <div className="card p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-brand-600 flex-shrink-0" />
            <div>
              <div className="font-medium text-gray-900 text-sm">Ativar notificações</div>
              <div className="text-xs text-gray-500">Receba um aviso quando o escritório enviar um novo documento.</div>
            </div>
          </div>
          <button onClick={ativarNotificacoes} disabled={ativando} className="btn-primary btn-sm flex-shrink-0">
            {ativando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ativar'}
          </button>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        {atalhos.map(a => {
          const contador = contadores[a.secao]
          return (
            <Link key={a.to} to={a.to} className="card p-5 hover:shadow-md transition-shadow relative">
              {contador > 0 && (
                <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-semibold rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1">
                  {contador > 99 ? '99+' : contador}
                </span>
              )}
              <a.icon className="w-6 h-6 text-brand-600 mb-3" />
              <div className="font-semibold text-gray-900 mb-1">{a.label}</div>
              <div className="text-sm text-gray-500">{a.desc}</div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
