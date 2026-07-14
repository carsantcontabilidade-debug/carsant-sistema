-- =====================================================
-- CARSANT — Notificações Push do Portal do Cliente
-- Execute no Supabase SQL Editor, com portal-cliente.sql já aplicado
-- (depende de cliente_id_do_usuario()). Script idempotente.
-- =====================================================

create table if not exists push_subscriptions (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

create index if not exists idx_push_subscriptions_cliente_id on push_subscriptions(cliente_id);

alter table push_subscriptions enable row level security;

-- Cliente gerencia apenas as próprias assinaturas (um por navegador/celular).
drop policy if exists "push_subscriptions_select_proprio" on push_subscriptions;
create policy "push_subscriptions_select_proprio"
  on push_subscriptions for select
  using (cliente_id = cliente_id_do_usuario());

drop policy if exists "push_subscriptions_insert_proprio" on push_subscriptions;
create policy "push_subscriptions_insert_proprio"
  on push_subscriptions for insert
  with check (cliente_id = cliente_id_do_usuario());

-- Necessária para o upsert (mesmo endpoint reassinando) em src/lib/push.js.
drop policy if exists "push_subscriptions_update_proprio" on push_subscriptions;
create policy "push_subscriptions_update_proprio"
  on push_subscriptions for update
  using (cliente_id = cliente_id_do_usuario())
  with check (cliente_id = cliente_id_do_usuario());

drop policy if exists "push_subscriptions_delete_proprio" on push_subscriptions;
create policy "push_subscriptions_delete_proprio"
  on push_subscriptions for delete
  using (cliente_id = cliente_id_do_usuario());

-- O envio em si roda em api/_push.js com a service role key (bypassa RLS),
-- então não precisa de policy de leitura para staff aqui.
