// Busca o perfil (role) de quem chamou a API. Uma falha passageira da consulta
// não pode virar "não é gestor" (403): num lote de NFS-e, uma nota recusada
// com "Apenas o gestor pode emitir..." mesmo sendo o gestor (relatado em
// 2026-10-13). Tenta de novo antes de desistir e devolve `falha: true` quando
// o problema foi a consulta, não a permissão.
export async function buscarPerfil(admin, userId) {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data, error } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (!error) return { perfil: data, falha: false };
    await new Promise((r) => setTimeout(r, 400));
  }
  return { perfil: null, falha: true };
}

export const ERRO_VERIFICAR_PERMISSAO = 'Não foi possível verificar suas permissões agora (instabilidade temporária). Tente de novo.';
