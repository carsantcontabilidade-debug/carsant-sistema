import { useState, useEffect } from 'react'

// useState que sobrevive à navegação entre páginas. Ao sair de uma página
// (ex.: clicar em outro item do menu) o React desmonta o componente e todo
// useState comum daquela página volta ao valor inicial — inclusive um
// formulário de cadastro que o usuário estava preenchendo. Este hook guarda
// o valor no sessionStorage a cada mudança e o recupera ao montar de novo,
// então voltar pra página restaura o que estava sendo digitado.
//
// Dura até a aba ser fechada, ou até algo chamar `limpar()` explicitamente
// (ex.: depois de salvar o formulário com sucesso, ou ao cancelar/fechar o
// modal de propósito) — sem isso, um rascunho salvo ficaria reaparecendo
// pra sempre mesmo depois de já ter sido usado.
export function usePersistedState(chave, valorInicial) {
  const [valor, setValor] = useState(() => {
    try {
      const salvo = sessionStorage.getItem(chave)
      return salvo !== null ? JSON.parse(salvo) : valorInicial
    } catch {
      return valorInicial
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(chave, JSON.stringify(valor))
    } catch {
      // sessionStorage indisponível (modo privado) ou valor não
      // serializável — sem tolerância extra nesse caso, mas sem quebrar
      // o formulário por causa disso.
    }
  }, [chave, valor])

  function limpar() {
    try {
      sessionStorage.removeItem(chave)
    } catch {
      // ignora
    }
  }

  return [valor, setValor, limpar]
}
