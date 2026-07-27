-- =====================================================
-- CARSANT — Data de emissão da NFS-e (separada da competência)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- O WebISS já devolve <DataEmissao> na resposta do GerarNfse, mas até
-- agora só a competência era guardada — sem isso, não dá pra filtrar
-- o painel de Notas Fiscais por data real de emissão (distinta do mês
-- de competência, ex: nota emitida em 05/08 referente a julho).
-- =====================================================

alter table notas_fiscais add column if not exists data_emissao timestamptz;
