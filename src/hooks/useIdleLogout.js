import { useEffect, useRef } from 'react'

const EVENTOS_ATIVIDADE = ['mousedown', 'keydown', 'scroll', 'touchstart']
export const CHAVE_ULTIMA_ATIVIDADE = 'carsant_ultima_atividade'

// Chame isto logo que um login for bem-sucedido (AuthContext/
// PortalAuthContext). Sem isso, um valor antigo deixado no
// sessionStorage por uma sessão de horas atrás (mesma aba) faz o
// próximo login ser deslogado na hora — o hook, ao montar, vê "última
// atividade" de horas atrás e acha que já expirou, mesmo o usuário tendo
// acabado de digitar a senha. Bug real encontrado em 2026-07-29.
export function registrarLoginComoAtividade() {
  sessionStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(Date.now()))
}

// Desloga automaticamente depois de `minutos` sem nenhuma interação do
// usuário (mouse/teclado/toque/scroll). Complementa a troca pra
// sessionStorage: aquilo resolve "fechei o navegador e continuo
// logado", isto resolve "deixei o navegador aberto sem supervisão".
//
// Bug real encontrado (2026-07-29): um setTimeout puro em memória não é
// suficiente — o Chrome (e outros) pode "descartar" uma aba em segundo
// plano por muito tempo pra liberar memória; ao voltar pra ela, a página
// recarrega do zero (o usuário nem percebe, a URL não muda), o que
// remonta este hook e reinicia o cronômetro completo do zero. Como o
// sessionStorage sobrevive a esse recarregamento (é a mesma aba), a
// sessão do Supabase continua válida e o usuário aparece "ainda logado"
// mesmo tendo ficado horas sem tocar no sistema. Por isso o horário da
// última atividade fica salvo no sessionStorage: ao montar (ou quando a
// aba volta a ficar visível), confere IMEDIATAMENTE se já passou do
// limite antes de agendar um novo cronômetro — em vez de sempre dar mais
// `minutos` completos a partir de agora.
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

    const limiteMs = minutos * 60 * 1000

    function registrarAtividade() {
      sessionStorage.setItem(CHAVE_ULTIMA_ATIVIDADE, String(Date.now()))
    }

    // Retorna true se já expirou (e chamou o callback de logout).
    function expirouAgora() {
      const ultima = Number(sessionStorage.getItem(CHAVE_ULTIMA_ATIVIDADE)) || Date.now()
      if (Date.now() - ultima >= limiteMs) {
        callbackRef.current?.()
        return true
      }
      return false
    }

    function reiniciar() {
      registrarAtividade()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        if (!expirouAgora()) reiniciar()
      }, limiteMs)
    }

    function aoVoltarVisivel() {
      if (document.visibilityState === 'visible' && !expirouAgora()) reiniciar()
    }

    if (!expirouAgora()) reiniciar()

    EVENTOS_ATIVIDADE.forEach((ev) => window.addEventListener(ev, reiniciar))
    document.addEventListener('visibilitychange', aoVoltarVisivel)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      EVENTOS_ATIVIDADE.forEach((ev) => window.removeEventListener(ev, reiniciar))
      document.removeEventListener('visibilitychange', aoVoltarVisivel)
    }
  }, [ativo, minutos])
}
