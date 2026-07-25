-- =====================================================
-- CARSANT — Badges de "novo" no Portal do Cliente
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
--
-- Guarda só a última vez que o cliente visitou cada aba (Honorários,
-- Documentos, Comunicação) — o número do badge é calculado como
-- "quantos itens novos existem desde essa data", sem precisar marcar
-- item por item como lido.
-- =====================================================

create table if not exists portal_leituras (
  cliente_id uuid not null references clientes(id) on delete cascade,
  secao text not null check (secao in ('honorarios', 'documentos', 'comunicacao')),
  visitado_em timestamptz not null default now(),
  primary key (cliente_id, secao)
);

alter table portal_leituras enable row level security;

drop policy if exists "portal_leituras_select_proprio" on portal_leituras;
create policy "portal_leituras_select_proprio"
  on portal_leituras for select
  using (cliente_id = cliente_id_do_usuario());

drop policy if exists "portal_leituras_insert_proprio" on portal_leituras;
create policy "portal_leituras_insert_proprio"
  on portal_leituras for insert
  with check (cliente_id = cliente_id_do_usuario());

drop policy if exists "portal_leituras_update_proprio" on portal_leituras;
create policy "portal_leituras_update_proprio"
  on portal_leituras for update
  using (cliente_id = cliente_id_do_usuario());
