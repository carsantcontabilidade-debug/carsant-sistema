-- =====================================================
-- CARSANT — CORREÇÃO CRÍTICA: isola dados internos do Portal do Cliente
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
--
-- As políticas abaixo ("qualquer autenticado pode ver") foram escritas
-- antes do Portal do Cliente existir. Como o cliente logado no Portal
-- também é "authenticated" no Supabase, ele conseguia ler dados de
-- TODOS os clientes nessas tabelas direto pelo banco — não só a tela
-- errada aparecia (Dashboard interno), o próprio dado ficava exposto
-- independente da tela. Corrige com o mesmo padrão já usado em
-- documentos_cliente/notas_fiscais: adiciona "and cliente_id_do_usuario()
-- is null" para excluir contas de cliente dessas políticas de staff.
-- =====================================================

drop policy if exists "clientes_select" on clientes;
create policy "clientes_select"
  on clientes for select
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

drop policy if exists "honorarios_select" on pagamentos_honorarios;
create policy "honorarios_select"
  on pagamentos_honorarios for select
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

drop policy if exists "despesas_select" on despesas;
create policy "despesas_select"
  on despesas for select
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

drop policy if exists "pag_despesas_select" on pagamentos_despesas;
create policy "pag_despesas_select"
  on pagamentos_despesas for select
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

drop policy if exists "atendimentos_select" on atendimentos;
create policy "atendimentos_select"
  on atendimentos for select
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

drop policy if exists "atendimentos_insert" on atendimentos;
create policy "atendimentos_insert"
  on atendimentos for insert
  with check (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

drop policy if exists "eventos_select" on eventos;
create policy "eventos_select"
  on eventos for select
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

drop policy if exists "eventos_insert" on eventos;
create policy "eventos_insert"
  on eventos for insert
  with check (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

-- tarefas_select_colaborador/tarefas_update_colaborador já ficam seguras
-- na prática (nome_usuario() retorna null para conta de cliente, e a
-- comparação com null nunca é verdadeira), mas reforça por clareza.
drop policy if exists "tarefas_select_colaborador" on tarefas;
create policy "tarefas_select_colaborador"
  on tarefas for select
  using (
    auth.role() = 'authenticated'
    and cliente_id_do_usuario() is null
    and responsavel = nome_usuario()
  );
