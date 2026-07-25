-- =====================================================
-- CARSANT — Vincula notas_fiscais a uma cobrança (Fase 5)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- =====================================================

alter table notas_fiscais add column if not exists cobranca_id uuid references cobrancas(id) on delete set null;
