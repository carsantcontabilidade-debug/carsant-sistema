-- =====================================================
-- CARSANT — Qualquer funcionário vê os nomes da equipe
-- Necessário para os seletores de "Responsável" (Clientes, Tarefas,
-- Atendimento, Agenda) mostrarem a equipe real, não uma lista fixa.
-- Antes disso, só o gestor podia listar profiles (colaborador via
-- RLS só via o próprio nome). Não expõe nada além do nome.
-- =====================================================
drop policy if exists "colaboradores_veem_nomes_da_equipe" on profiles;
create policy "colaboradores_veem_nomes_da_equipe"
  on profiles for select
  using (auth.role() = 'authenticated');
