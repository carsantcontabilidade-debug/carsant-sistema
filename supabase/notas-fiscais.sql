-- =====================================================
-- CARSANT — Endereço em clientes + histórico de NFS-e
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- =====================================================

-- =====================================================
-- 1. Campos de endereço em clientes
-- Necessários para emitir NFS-e: o cálculo de IBS/CBS pós-reforma
-- tributária depende do destino do serviço (endereço do tomador).
-- =====================================================
alter table clientes add column if not exists logradouro text;
alter table clientes add column if not exists numero_endereco text;
alter table clientes add column if not exists complemento text;
alter table clientes add column if not exists bairro text;
alter table clientes add column if not exists cep text;
alter table clientes add column if not exists uf text default 'BA';
alter table clientes add column if not exists codigo_municipio_ibge text default '2910800';

-- =====================================================
-- 2. Histórico de NFS-e emitidas
-- rps_numero é controlado por nós (não pelo WebISS) — precisa ser
-- sequencial e único por ambiente/série para o webservice aceitar.
-- =====================================================
create table if not exists notas_fiscais (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid references clientes on delete restrict,
  ambiente text not null check (ambiente in ('homologacao', 'producao')),
  rps_numero integer not null,
  rps_serie text not null default '1',
  numero_nfse text,
  codigo_verificacao text,
  chave_acesso text,
  competencia date not null,
  valor_servicos numeric(10,2) not null,
  discriminacao text not null,
  status text not null default 'emitida' check (status in ('emitida', 'erro')),
  xml_resposta text,
  erro_mensagem text,
  emitida_por uuid references auth.users(id),
  created_at timestamptz default now(),
  unique (ambiente, rps_numero, rps_serie)
);

alter table notas_fiscais enable row level security;

drop policy if exists "staff_ve_notas_fiscais" on notas_fiscais;
create policy "staff_ve_notas_fiscais"
  on notas_fiscais for select
  using (auth.role() = 'authenticated');

drop policy if exists "gestor_insere_notas_fiscais" on notas_fiscais;
create policy "gestor_insere_notas_fiscais"
  on notas_fiscais for insert
  with check (is_gestor());

drop policy if exists "gestor_atualiza_notas_fiscais" on notas_fiscais;
create policy "gestor_atualiza_notas_fiscais"
  on notas_fiscais for update
  using (is_gestor());
