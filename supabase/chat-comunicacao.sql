-- =====================================================
-- CARSANT — Chat bidirecional (Comunicação / Portal do Cliente)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Substitui o antigo modelo "comunicacoes = 1 linha por envio" (que
-- continua existindo, intacto, para WhatsApp/E-mail/Telefone/Presencial)
-- por duas tabelas novas dedicadas ao chat: chat_conversas (uma conversa
-- por cliente+assunto, roteada a um setor/pessoa) e chat_mensagens (as
-- mensagens dentro de cada conversa, dos dois lados).
-- =====================================================

-- =====================================================
-- 1. Setor de cada colaborador (equipe interna)
-- =====================================================
alter table profiles
  add column if not exists setor text check (setor in ('fiscal', 'pessoal', 'financeiro', 'contabil'));

-- Ajuste os nomes abaixo se não baterem exatamente com profiles.nome
-- (confira antes em Table Editor → profiles).
update profiles set setor = 'fiscal'     where nome ilike 'Bruno%'  and setor is null;
update profiles set setor = 'pessoal'    where nome ilike 'Karine%' and setor is null;
update profiles set setor = 'financeiro' where nome ilike 'Ronaldo%' and setor is null;
update profiles set setor = 'contabil'   where (nome ilike 'Cintia%' or nome ilike 'Cíntia%') and setor is null;

-- =====================================================
-- 2. chat_conversas — uma conversa por cliente+assunto
-- =====================================================
create table if not exists chat_conversas (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid not null references clientes(id) on delete cascade,
  assunto text not null,
  setor text not null check (setor in ('fiscal', 'pessoal', 'financeiro', 'contabil')),
  responsavel_atual_id uuid references profiles(id) on delete set null,
  status text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_chat_conversas_cliente_id on chat_conversas(cliente_id);

alter table chat_conversas enable row level security;

-- Staff (qualquer autenticado da equipe) vê e cria/edita todas as
-- conversas — inclusive para poder encaminhar entre setores/pessoas.
drop policy if exists "chat_conversas_staff_all" on chat_conversas;
create policy "chat_conversas_staff_all"
  on chat_conversas for all
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null)
  with check (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

-- Cliente vê e cria apenas as próprias conversas.
drop policy if exists "chat_conversas_select_proprio" on chat_conversas;
create policy "chat_conversas_select_proprio"
  on chat_conversas for select
  using (cliente_id = cliente_id_do_usuario());

drop policy if exists "chat_conversas_insert_proprio" on chat_conversas;
create policy "chat_conversas_insert_proprio"
  on chat_conversas for insert
  with check (cliente_id = cliente_id_do_usuario());

-- =====================================================
-- 3. chat_mensagens — mensagens dentro de cada conversa
-- =====================================================
create table if not exists chat_mensagens (
  id uuid default uuid_generate_v4() primary key,
  conversa_id uuid not null references chat_conversas(id) on delete cascade,
  origem text not null check (origem in ('cliente', 'escritorio')),
  autor_id uuid references auth.users(id),
  autor_nome text,
  mensagem text,
  anexo_nome text,
  anexo_path text,
  created_at timestamptz default now()
);

create index if not exists idx_chat_mensagens_conversa_id on chat_mensagens(conversa_id);

alter table chat_mensagens enable row level security;

-- Staff vê e envia mensagens em qualquer conversa.
drop policy if exists "chat_mensagens_staff_all" on chat_mensagens;
create policy "chat_mensagens_staff_all"
  on chat_mensagens for all
  using (
    auth.role() = 'authenticated' and cliente_id_do_usuario() is null
  )
  with check (
    auth.role() = 'authenticated' and cliente_id_do_usuario() is null and origem = 'escritorio'
  );

-- Cliente vê e envia mensagens apenas nas próprias conversas.
drop policy if exists "chat_mensagens_select_proprio" on chat_mensagens;
create policy "chat_mensagens_select_proprio"
  on chat_mensagens for select
  using (
    conversa_id in (select id from chat_conversas where cliente_id = cliente_id_do_usuario())
  );

drop policy if exists "chat_mensagens_insert_proprio" on chat_mensagens;
create policy "chat_mensagens_insert_proprio"
  on chat_mensagens for insert
  with check (
    origem = 'cliente'
    and conversa_id in (select id from chat_conversas where cliente_id = cliente_id_do_usuario())
  );

-- Mantém updated_at da conversa em dia a cada nova mensagem (pra
-- ordenar a lista de conversas pela mais recentemente ativa).
create or replace function chat_toca_conversa()
returns trigger as $$
begin
  update chat_conversas set updated_at = now() where id = new.conversa_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists chat_mensagens_toca_conversa on chat_mensagens;
create trigger chat_mensagens_toca_conversa
  after insert on chat_mensagens
  for each row execute procedure chat_toca_conversa();

-- =====================================================
-- 3.1 Realtime — mensagens aparecem na hora nos dois lados
-- =====================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_mensagens'
  ) then
    alter publication supabase_realtime add table chat_mensagens;
  end if;
end $$;

-- =====================================================
-- 4. Bucket de Storage para anexos do chat
-- PRIVADO — acesso sempre via createSignedUrl, nunca getPublicUrl.
-- Convenção de path: `${conversa_id}/${nome_arquivo}`.
-- =====================================================
insert into storage.buckets (id, name, public)
values ('chat-anexos', 'chat-anexos', false)
on conflict (id) do nothing;

drop policy if exists "chat_anexos_storage_staff" on storage.objects;
create policy "chat_anexos_storage_staff"
  on storage.objects for all
  using (bucket_id = 'chat-anexos' and cliente_id_do_usuario() is null)
  with check (bucket_id = 'chat-anexos' and cliente_id_do_usuario() is null);

drop policy if exists "chat_anexos_storage_proprio_select" on storage.objects;
create policy "chat_anexos_storage_proprio_select"
  on storage.objects for select
  using (
    bucket_id = 'chat-anexos'
    and (storage.foldername(name))[1] in (
      select id::text from chat_conversas where cliente_id = cliente_id_do_usuario()
    )
  );

drop policy if exists "chat_anexos_storage_proprio_insert" on storage.objects;
create policy "chat_anexos_storage_proprio_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-anexos'
    and (storage.foldername(name))[1] in (
      select id::text from chat_conversas where cliente_id = cliente_id_do_usuario()
    )
  );
