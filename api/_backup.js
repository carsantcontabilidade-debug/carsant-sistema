// Tabelas incluídas no backup — usado tanto pelo download manual
// (api/backup-export.js) quanto pelo envio semanal automático por
// e-mail (api/backup-email.js). Não inclui o conteúdo dos arquivos do
// Storage (documentos, boletos, anexos do chat) — só os metadados; os
// arquivos em si continuam guardados no Supabase Storage.
const TABELAS_BACKUP = [
  'profiles',
  'clientes',
  'pagamentos_honorarios',
  'despesas',
  'pagamentos_despesas',
  'tarefas',
  'atendimentos',
  'eventos',
  'comunicacoes',
  'cobrancas',
  'notas_fiscais',
  'documentos_cliente',
  'chat_conversas',
  'chat_mensagens',
  'portal_leituras',
  'certidoes',
];

export async function gerarBackup(admin) {
  const resultado = { gerado_em: new Date().toISOString(), tabelas: {} };
  for (const tabela of TABELAS_BACKUP) {
    const { data, error } = await admin.from(tabela).select('*');
    resultado.tabelas[tabela] = error ? { erro: error.message } : data;
  }
  return resultado;
}
