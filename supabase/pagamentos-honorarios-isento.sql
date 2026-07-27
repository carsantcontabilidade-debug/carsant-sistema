-- =====================================================
-- CARSANT — Isentar cliente de honorário num mês específico
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Antes, um cliente "Pendente"/"Em atraso" só tinha as opções
-- Marcar pago ou nada — sem jeito de dizer "esse mês não se aplica"
-- (férias, pausa, erro de cobrança) sem inventar um pagamento falso.
-- =====================================================

alter table pagamentos_honorarios add column if not exists isento boolean default false;
