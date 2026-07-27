-- =====================================================
-- CARSANT — Cancelamento e substituição de NFS-e
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
-- =====================================================

alter table notas_fiscais drop constraint if exists notas_fiscais_status_check;
alter table notas_fiscais add constraint notas_fiscais_status_check
  check (status in ('emitida', 'erro', 'cancelada'));

alter table notas_fiscais add column if not exists cancelada_em timestamptz;
alter table notas_fiscais add column if not exists motivo_cancelamento text;

-- Nota nova criada por uma substituição aponta pra nota antiga (que fica
-- com status='cancelada'), preservando o histórico das duas.
alter table notas_fiscais add column if not exists substitui_nota_id uuid references notas_fiscais(id);
