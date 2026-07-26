-- =====================================================
-- CARSANT — Página Configurações (cadastro de usuários)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
--
-- A política "perfil_update" original (security.sql) só deixa cada
-- usuário editar o PRÓPRIO perfil — não existia nenhuma política que
-- deixasse o gestor mudar a role/setor de outro colaborador pela tela
-- de Configurações. Esta é aditiva, não remove a existente.
-- =====================================================
drop policy if exists "gestor_update_todos_perfis" on profiles;
create policy "gestor_update_todos_perfis"
  on profiles for update
  using (is_gestor());
