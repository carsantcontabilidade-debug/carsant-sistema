-- =====================================================
-- CARSANT — Painel de lembrete de Certidões Negativas
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Não é renovação automática (a maioria dos portais de prefeitura/
-- governo usa CAPTCHA e não tem API unificada — não é algo que dá pra
-- automatizar com segurança). É um painel interno pra não perder o
-- prazo: registra cada certidão obtida com a validade, e o sistema
-- avisa quando está vencendo/vencida. Uso só da equipe — não aparece
-- no Portal do Cliente.
-- =====================================================
create table if not exists certidoes (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null check (tipo in ('municipal', 'estadual', 'federal', 'trabalhista', 'fgts', 'falencia')),
  data_emissao date,
  data_validade date,
  storage_path text,
  nome_arquivo text,
  observacoes text,
  registrado_por uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists idx_certidoes_cliente_id on certidoes(cliente_id);
create index if not exists idx_certidoes_tipo on certidoes(tipo);

alter table certidoes enable row level security;

-- Só a equipe (não o Portal do Cliente) — mesmo padrão de guarda usado
-- em documentos_cliente/chat_conversas.
drop policy if exists "certidoes_staff_all" on certidoes;
create policy "certidoes_staff_all"
  on certidoes for all
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null)
  with check (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

-- =====================================================
-- Bucket de Storage para os PDFs das certidões (privado)
-- =====================================================
insert into storage.buckets (id, name, public)
values ('certidoes', 'certidoes', false)
on conflict (id) do nothing;

drop policy if exists "certidoes_storage_staff" on storage.objects;
create policy "certidoes_storage_staff"
  on storage.objects for all
  using (bucket_id = 'certidoes' and cliente_id_do_usuario() is null)
  with check (bucket_id = 'certidoes' and cliente_id_do_usuario() is null);
