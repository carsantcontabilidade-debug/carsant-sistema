-- =====================================================
-- CARSANT — Data de início de cobrança de honorário por cliente
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Antes, a tela de Honorários assumia que TODO cliente com
-- valor_honorario > 0 já devia honorário em qualquer um dos últimos 12
-- meses do seletor — mesmo em meses de antes de o cliente existir ou de
-- antes do sistema estar em uso. Isso mostrava "Em atraso" pra meses que
-- nunca deveriam ter sido cobrados, e não dava pra corrigir de forma
-- prática (só ocultando mês a mês). Com esta coluna, meses antes da data
-- informada simplesmente não aparecem — nem como pendente, nem atraso.
-- Cliente sem essa data preenchida continua funcionando como antes
-- (aplica a todos os meses).
-- =====================================================

alter table clientes add column if not exists honorario_inicio date;
