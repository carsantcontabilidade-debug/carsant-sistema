import { useRegisterSW } from 'virtual:pwa-register/react'

// Verifica se há uma nova versão publicada a cada 60s (além da checagem
// automática que o navegador já faz a cada navegação/foco de aba).
const CHECK_INTERVAL_MS = 60 * 1000

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        registration.update()
      }, CHECK_INTERVAL_MS)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-blue-600 text-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 text-sm">
      <span>Nova versão do sistema disponível.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="bg-white text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
      >
        Atualizar agora
      </button>
    </div>
  )
}
