import { supabase } from './supabase'

// Nomes reais da equipe (tabela profiles), usados nos seletores de
// "Responsável" em Clientes, Tarefas, Atendimento e Agenda.
export async function buscarColaboradores() {
  const { data } = await supabase.from('profiles').select('nome').order('nome')
  return (data || []).map(p => p.nome).filter(Boolean)
}
