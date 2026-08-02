-- =====================================================
-- CARSANT — Saldos migrados de outro sistema (por tipo)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Substitui o campo único clientes.saldo_devedor_migrado (que ficou
-- pequeno demais — Ronaldo tem vários tipos de saldo por cliente:
-- acordo, mensalidades atrasadas, etc.) por uma tabela com múltiplos
-- lançamentos, cada um com tipo/valor/descrição, igual ao padrão já
-- usado em descontos_honorarios.
-- =====================================================

create table if not exists saldos_migrados (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid references clientes(id) on delete cascade,
  tipo text not null,
  valor numeric(10,2) not null,
  descricao text,
  lancado_por uuid references profiles(id),
  created_at timestamptz default now()
);

alter table saldos_migrados enable row level security;

drop policy if exists "gestor_gerencia_saldos_migrados" on saldos_migrados;
create policy "gestor_gerencia_saldos_migrados"
  on saldos_migrados for all
  using (is_gestor())
  with check (is_gestor());
