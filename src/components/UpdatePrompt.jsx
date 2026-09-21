import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Verifica se há uma nova versão publicada a cada 60s (além da checagem
// automática que o navegador já faz a cada navegação/foco de aba).
const CHECK_INTERVAL_MS = 60 * 1000

// A atualização é automática — não fica esperando o usuário notar e clicar
// num aviso (que passa despercebido com um modal aberto por cima, por
// exemplo). Assim que uma versão nova é detectada, a página recarrega
// sozinha com o código atualizado.
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

  useEffect(() => {
    if (needRefresh) updateServiceWorker(true)
  }, [needRefresh, updateServiceWorker])

  return null
}
