-- =====================================================
-- CARSANT — Ocultar cliente de honorário num mês específico
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Antes, "Excluir registro" apagava a linha do banco — o que fazia o
-- status voltar a ser calculado pela data de vencimento (pendente/
-- atraso), quando o esperado era o cliente simplesmente sumir da lista
-- daquele mês (nem pendente, nem isento). Corrigido: em vez de apagar,
-- marca "oculto" — e a tela para de contar/mostrar esse cliente naquele
-- mês, com uma forma de reverter caso seja clicado sem querer.
-- =====================================================

alter table pagamentos_honorarios add column if not exists oculto boolean default false;
