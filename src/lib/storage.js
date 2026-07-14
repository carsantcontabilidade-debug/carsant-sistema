// Supabase Storage rejeita chaves de arquivo com espaços/acentos ("Invalid key").
export function sanitizarNomeArquivo(nome) {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
}
