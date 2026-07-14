-- =====================================================
-- CARSANT — Portal do Cliente (Fase 3)
-- Execute no Supabase SQL Editor, com schema.sql e
-- security.sql (e is_gestor()) já aplicados.
-- Script idempotente: pode rodar de novo sem erro.
-- =====================================================

-- =====================================================
-- 1. Vínculo entre cliente e conta de login
-- =====================================================
alter table clientes
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- =====================================================
-- 2. Função auxiliar: id do cliente vinculado ao usuário logado
-- (null se o usuário logado for um funcionário, não um cliente)
-- =====================================================
create or replace function cliente_id_do_usuario()
returns uuid as $$
  select id from clientes where auth_user_id = auth.uid();
$$ language sql security definer stable;

-- =====================================================
-- 3. Documentos trocados com o cliente
-- (cobre notas fiscais/extratos/comprovantes enviados pelo
-- cliente E guias/folha/relatórios enviados pelo escritório —
-- mesma operação, categoria diferente)
-- =====================================================
create table if not exists documentos_cliente (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  categoria text not null check (categoria in
    ('nota_fiscal', 'extrato', 'comprovante', 'guia', 'folha_pagamento', 'relatorio', 'outro')),
  origem text not null check (origem in ('cliente', 'escritorio')),
  nome_arquivo text not null,
  storage_path text not null,
  mes_referencia text,
  enviado_por uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists idx_documentos_cliente_cliente_id on documentos_cliente(cliente_id);
create index if not exists idx_documentos_cliente_categoria on documentos_cliente(categoria);

alter table documentos_cliente enable row level security;

-- Staff (qualquer autenticado da equipe) mantém acesso total,
-- igual ao padrão já usado nas demais tabelas internas.
drop policy if exists "documentos_cliente_staff_all" on documentos_cliente;
create policy "documentos_cliente_staff_all"
  on documentos_cliente for all
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null)
  with check (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

-- Cliente vê e envia apenas os próprios documentos.
drop policy if exists "documentos_cliente_select_proprio" on documentos_cliente;
create policy "documentos_cliente_select_proprio"
  on documentos_cliente for select
  using (cliente_id = cliente_id_do_usuario());

drop policy if exists "documentos_cliente_insert_proprio" on documentos_cliente;
create policy "documentos_cliente_insert_proprio"
  on documentos_cliente for insert
  with check (cliente_id = cliente_id_do_usuario() and origem = 'cliente');

-- =====================================================
-- 4. Acesso do cliente às próprias tabelas já existentes
-- (aditivo — não remove nenhuma policy de equipe já existente)
-- =====================================================

-- clientes: cliente vê a própria linha
drop policy if exists "clientes_select_proprio" on clientes;
create policy "clientes_select_proprio"
  on clientes for select
  using (auth_user_id = auth.uid());

-- pagamentos_honorarios: cliente vê o próprio histórico
drop policy if exists "honorarios_select_proprio" on pagamentos_honorarios;
create policy "honorarios_select_proprio"
  on pagamentos_honorarios for select
  using (cliente_id = cliente_id_do_usuario());

-- comunicacoes: cliente vê o próprio histórico
drop policy if exists "comunicacoes_select_proprio" on comunicacoes;
create policy "comunicacoes_select_proprio"
  on comunicacoes for select
  using (cliente_id = cliente_id_do_usuario());

-- cobrancas: cliente vê as próprias cobranças.
-- ATENÇÃO — checkpoint manual: a tabela `cobrancas` não tem
-- CREATE TABLE em nenhum arquivo do repositório (foi criada direto
-- no painel do Supabase). Antes de rodar este bloco, confirme no
-- painel (Table Editor → cobrancas) que a coluna `cliente_id`
-- existe com esse nome exato e que RLS já está habilitado na tabela.
drop policy if exists "cobrancas_select_proprio" on cobrancas;
create policy "cobrancas_select_proprio"
  on cobrancas for select
  using (cliente_id = cliente_id_do_usuario());

-- =====================================================
-- 5. Bucket de Storage para documentos do cliente
-- PRIVADO (diferente do bucket "boletos", que é público) —
-- acesso sempre via createSignedUrl, nunca getPublicUrl.
-- =====================================================
insert into storage.buckets (id, name, public)
values ('documentos-clientes', 'documentos-clientes', false)
on conflict (id) do nothing;

-- Staff lê/escreve tudo no bucket.
drop policy if exists "documentos_clientes_storage_staff" on storage.objects;
create policy "documentos_clientes_storage_staff"
  on storage.objects for all
  using (bucket_id = 'documentos-clientes' and cliente_id_do_usuario() is null)
  with check (bucket_id = 'documentos-clientes' and cliente_id_do_usuario() is null);

-- Cliente só acessa arquivos dentro da própria pasta
-- (convenção de path: `${cliente_id}/${nome_arquivo}`).
drop policy if exists "documentos_clientes_storage_proprio_select" on storage.objects;
create policy "documentos_clientes_storage_proprio_select"
  on storage.objects for select
  using (
    bucket_id = 'documentos-clientes'
    and (storage.foldername(name))[1] = cliente_id_do_usuario()::text
  );

drop policy if exists "documentos_clientes_storage_proprio_insert" on storage.objects;
create policy "documentos_clientes_storage_proprio_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'documentos-clientes'
    and (storage.foldername(name))[1] = cliente_id_do_usuario()::text
  );
