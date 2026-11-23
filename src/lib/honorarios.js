// Situação do honorário de um cliente num mês — mesma regra da tela de
// Honorários, para o Dashboard não divergir dela.
// mes: 0-11 (como Date). pagamentos: linhas de pagamentos_honorarios do mês.
// cobrancasPagasIds: Set de cliente_id com cobrança de honorário paga no mês.
export function situacaoHonorario(c, { pagamentos, cobrancasPagasIds, ano, mes, hoje }) {
  if (c.honorario_inicio) {
    const inicio = new Date(`${c.honorario_inicio}T00:00:00`);
    if (ano * 12 + mes < inicio.getFullYear() * 12 + inicio.getMonth()) return 'fora_periodo';
  }
  const registro = pagamentos.find((p) => p.cliente_id === c.id);
  if (registro?.oculto) return 'oculto';
  if (registro?.isento) return 'isento';
  if (registro?.pago) return 'pago';
  if (cobrancasPagasIds.has(c.id)) return 'pago';
  const venc = new Date(ano, mes, c.dia_vencimento || 10);
  return hoje > venc ? 'atraso' : 'pendente';
}
