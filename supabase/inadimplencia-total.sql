-- =====================================================
-- CARSANT — Inadimplência Total (saldo devedor migrado + descontos)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
-- =====================================================

-- Saldo devedor trazido de outro sistema (dívida anterior a este
-- sistema existir) — um valor único por cliente, editável na tela de
-- Inadimplência.
alter table clientes add column if not exists saldo_devedor_migrado numeric(10,2) default 0;

-- Descontos concedidos: cada concessão fica registrada (valor, motivo,
-- quem concedeu, quando) em vez de um único campo sobrescrevível — dá
-- pra ver o histórico depois.
create table if not exists descontos_honorarios (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid references clientes(id) on delete cascade,
  valor numeric(10,2) not null,
  motivo text,
  concedido_por uuid references profiles(id),
  created_at timestamptz default now()
);

alter table descontos_honorarios enable row level security;

drop policy if exists "gestor_gerencia_descontos" on descontos_honorarios;
create policy "gestor_gerencia_descontos"
  on descontos_honorarios for all
  using (is_gestor())
  with check (is_gestor());
