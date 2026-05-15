-- =====================================================
-- RESTRIÇÃO: Colaboradores não acessam dados financeiros
-- Execute no SQL Editor do Supabase
-- =====================================================

-- Remove políticas antigas de honorários e despesas
DROP POLICY IF EXISTS "honorarios_select" ON pagamentos_honorarios;
DROP POLICY IF EXISTS "despesas_select" ON despesas;
DROP POLICY IF EXISTS "pag_despesas_select" ON pagamentos_despesas;

-- Somente gestor pode VER honorários
CREATE POLICY "honorarios_select_gestor"
  ON pagamentos_honorarios FOR SELECT
  USING (is_gestor());

-- Somente gestor pode VER despesas
CREATE POLICY "despesas_select_gestor"
  ON despesas FOR SELECT
  USING (is_gestor());

-- Somente gestor pode VER pagamentos de despesas
CREATE POLICY "pag_despesas_select_gestor"
  ON pagamentos_despesas FOR SELECT
  USING (is_gestor());

-- Somente gestor pode VER clientes com valor de honorário
-- (colaboradores veem clientes mas sem o valor)
-- Nota: A tabela clientes fica visível para todos,
-- mas o campo valor_honorario só aparece para gestores
-- via controle no frontend (já implementado no Layout)