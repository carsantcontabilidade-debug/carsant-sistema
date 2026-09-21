import { useRegisterSW } from 'virtual:pwa-register/react'

// Verifica se há uma nova versão publicada a cada 60s (além da checagem
// automática que o navegador já faz a cada navegação/foco de aba).
const CHECK_INTERVAL_MS = 60 * 1000

// Antes recarregava a página sozinha, sem avisar, assim que detectava uma
// versão nova — inclusive no foco automático da aba (o navegador já
// verifica isso sozinho toda vez que a aba volta a ficar visível). Isso
// interrompia qualquer coisa em andamento (ex.: emissão de NFS-e em lote,
// que fica esperando alguns segundos entre cada nota) sempre que o Ronaldo
// trocava de aba/tela e voltava durante um deploy novo — relatado por ele
// em 2026-09-21. Agora só avisa com um banner discreto; quem decide a hora
// de atualizar é quem está usando o sistema.
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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-gray-900 text-white text-sm rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
      <span>Nova versão do sistema disponível.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg shrink-0"
      >
        Atualizar agora
      </button>
    </div>
  )
}
