import { useEffect, useRef } from 'react'

const EVENTOS_ATIVIDADE = ['mousedown', 'keydown', 'scroll', 'touchstart']

// Desloga automaticamente depois de `minutos` sem nenhuma interação do
// usuário (mouse/teclado/toque/scroll). Complementa a troca pra
// sessionStorage: aquilo resolve "fechei o navegador e continuo
// logado", isto resolve "deixei o navegador aberto sem supervisão".
export function useIdleLogout(ativo, minutos, aoExpirar) {
  const timeoutRef = useRef(null)
  // Ref sempre atualizado sem entrar nas deps do efeito — senão, toda
  // vez que aoExpirar for uma função nova (comum entre re-renders), o
  // efeito reiniciaria e resetaria o cronômetro de inatividade sem o
  // usuário ter feito nada.
  const callbackRef = useRef(aoExpirar)
  callbackRef.current = aoExpirar

  useEffect(() => {
    if (!ativo) return

    function reiniciar() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => callbackRef.current?.(), minutos * 60 * 1000)
    }

    reiniciar()
    EVENTOS_ATIVIDADE.forEach((ev) => window.addEventListener(ev, reiniciar))

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      EVENTOS_ATIVIDADE.forEach((ev) => window.removeEventListener(ev, reiniciar))
    }
  }, [ativo, minutos])
}
