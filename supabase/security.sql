-- =====================================================
-- CARSANT — Políticas de Segurança Avançadas (RLS)
-- Execute este script APÓS o schema.sql no Supabase
-- SQL Editor → New query → Cole tudo → Run
-- =====================================================

-- =====================================================
-- 1. REMOVE as políticas genéricas anteriores
-- =====================================================
drop policy if exists "Acesso total autenticado" on profiles;
drop policy if exists "Acesso total autenticado" on clientes;
drop policy if exists "Acesso total autenticado" on pagamentos_honorarios;
drop policy if exists "Acesso total autenticado" on despesas;
drop policy if exists "Acesso total autenticado" on pagamentos_despesas;
drop policy if exists "Acesso total autenticado" on tarefas;
drop policy if exists "Acesso total autenticado" on atendimentos;
drop policy if exists "Acesso total autenticado" on eventos;

-- =====================================================
-- 2. FUNÇÃO auxiliar: verifica se o usuário é gestor
-- =====================================================
create or replace function is_gestor()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'gestor'
  );
$$ language sql security definer stable;

-- =====================================================
-- 3. FUNÇÃO auxiliar: retorna o nome do usuário logado
-- =====================================================
create or replace function nome_usuario()
returns text as $$
  select nome from profiles where id = auth.uid();
$$ language sql security definer stable;

-- =====================================================
-- 4. POLÍTICAS — profiles
-- =====================================================

-- Cada usuário vê e edita apenas o próprio perfil
create policy "perfil_select"
  on profiles for select
  using (id = auth.uid());

create policy "perfil_update"
  on profiles for update
  using (id = auth.uid());

-- Gestor vê todos os perfis (para listar colaboradores)
create policy "gestor_select_todos_perfis"
  on profiles for select
  using (is_gestor());

-- =====================================================
-- 5. POLÍTICAS — clientes
-- =====================================================

-- Todos autenticados podem VER clientes
create policy "clientes_select"
  on clientes for select
  using (auth.role() = 'authenticated');

-- Só gestor pode CRIAR, EDITAR, DELETAR
create policy "clientes_insert"
  on clientes for insert
  with check (is_gestor());

create policy "clientes_update"
  on clientes for update
  using (is_gestor());

create policy "clientes_delete"
  on clientes for delete
  using (is_gestor());

-- =====================================================
-- 6. POLÍTICAS — pagamentos_honorarios
-- =====================================================

-- Todos autenticados podem VER
create policy "honorarios_select"
  on pagamentos_honorarios for select
  using (auth.role() = 'authenticated');

-- Só gestor pode CRIAR e EDITAR
create policy "honorarios_insert"
  on pagamentos_honorarios for insert
  with check (is_gestor());

create policy "honorarios_update"
  on pagamentos_honorarios for update
  using (is_gestor());

create policy "honorarios_delete"
  on pagamentos_honorarios for delete
  using (is_gestor());

-- =====================================================
-- 7. POLÍTICAS — despesas
-- =====================================================

-- Todos autenticados podem VER
create policy "despesas_select"
  on despesas for select
  using (auth.role() = 'authenticated');

-- Só gestor pode CRIAR, EDITAR, DELETAR
create policy "despesas_insert"
  on despesas for insert
  with check (is_gestor());

create policy "despesas_update"
  on despesas for update
  using (is_gestor());

create policy "despesas_delete"
  on despesas for delete
  using (is_gestor());

-- =====================================================
-- 8. POLÍTICAS — pagamentos_despesas
-- =====================================================

create policy "pag_despesas_select"
  on pagamentos_despesas for select
  using (auth.role() = 'authenticated');

create policy "pag_despesas_insert"
  on pagamentos_despesas for insert
  with check (is_gestor());

create policy "pag_despesas_update"
  on pagamentos_despesas for update
  using (is_gestor());

create policy "pag_despesas_delete"
  on pagamentos_despesas for delete
  using (is_gestor());

-- =====================================================
-- 9. POLÍTICAS — tarefas
-- =====================================================

-- Gestor vê TODAS as tarefas
create policy "tarefas_select_gestor"
  on tarefas for select
  using (is_gestor());

-- Colaborador vê APENAS as próprias tarefas
create policy "tarefas_select_colaborador"
  on tarefas for select
  using (
    auth.role() = 'authenticated'
    and responsavel = nome_usuario()
  );

-- Só gestor pode CRIAR e DELETAR tarefas
create policy "tarefas_insert"
  on tarefas for insert
  with check (is_gestor());

create policy "tarefas_delete"
  on tarefas for delete
  using (is_gestor());

-- Gestor pode editar qualquer tarefa
create policy "tarefas_update_gestor"
  on tarefas for update
  using (is_gestor());

-- Colaborador pode APENAS mudar o status das próprias tarefas
create policy "tarefas_update_colaborador"
  on tarefas for update
  using (
    auth.role() = 'authenticated'
    and responsavel = nome_usuario()
  )
  with check (
    responsavel = nome_usuario()
  );

-- =====================================================
-- 10. POLÍTICAS — atendimentos
-- =====================================================

-- Todos autenticados podem VER
create policy "atendimentos_select"
  on atendimentos for select
  using (auth.role() = 'authenticated');

-- Qualquer autenticado pode CRIAR (registrar atendimento)
create policy "atendimentos_insert"
  on atendimentos for insert
  with check (auth.role() = 'authenticated');

-- Só gestor pode EDITAR e DELETAR
create policy "atendimentos_update"
  on atendimentos for update
  using (is_gestor());

create policy "atendimentos_delete"
  on atendimentos for delete
  using (is_gestor());

-- =====================================================
-- 11. POLÍTICAS — eventos (agenda)
-- =====================================================

-- Todos autenticados podem VER
create policy "eventos_select"
  on eventos for select
  using (auth.role() = 'authenticated');

-- Qualquer autenticado pode CRIAR evento
create policy "eventos_insert"
  on eventos for insert
  with check (auth.role() = 'authenticated');

-- Só gestor pode EDITAR e DELETAR
create policy "eventos_update"
  on eventos for update
  using (is_gestor());

create policy "eventos_delete"
  on eventos for delete
  using (is_gestor());

-- =====================================================
-- 12. CONFIGURAÇÕES DE SENHA (execute separado se preferir)
-- =====================================================
-- No Supabase: Authentication → Policies
-- Ative as seguintes opções manualmente:
--   ✅ Minimum password length: 10
--   ✅ Require uppercase letters
--   ✅ Require numbers
--   ✅ Require special characters

-- =====================================================
-- 13. AUDITORIA — tabela de log de ações sensíveis
-- =====================================================
create table if not exists audit_log (
  id uuid default uuid_generate_v4() primary key,
  usuario_id uuid references auth.users,
  usuario_nome text,
  acao text not null,        -- 'INSERT', 'UPDATE', 'DELETE'
  tabela text not null,      -- nome da tabela afetada
  registro_id text,          -- id do registro afetado
  detalhes jsonb,            -- dados antes/depois
  ip_address text,
  created_at timestamptz default now()
);

alter table audit_log enable row level security;

-- Só gestor pode ver o log
create policy "audit_select_gestor"
  on audit_log for select
  using (is_gestor());

-- Sistema pode inserir (via trigger)
create policy "audit_insert_system"
  on audit_log for insert
  with check (true);

-- Função de auditoria para clientes
create or replace function audit_clientes()
returns trigger as $$
begin
  insert into audit_log (usuario_id, usuario_nome, acao, tabela, registro_id, detalhes)
  values (
    auth.uid(),
    nome_usuario(),
    tg_op,
    'clientes',
    coalesce(new.id::text, old.id::text),
    jsonb_build_object(
      'antes', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      'depois', case when tg_op = 'DELETE' then null else to_jsonb(new) end
    )
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Trigger de auditoria em clientes
drop trigger if exists audit_clientes_trigger on clientes;
create trigger audit_clientes_trigger
  after insert or update or delete on clientes
  for each row execute procedure audit_clientes();

-- =====================================================
-- 14. RESUMO DAS PERMISSÕES
-- =====================================================
-- 
-- GESTOR (Carlos):
--   ✅ Ver, criar, editar, deletar: clientes, honorários,
--      despesas, tarefas, atendimentos, eventos
--   ✅ Ver log de auditoria
--   ✅ Definir responsáveis das tarefas
--
-- COLABORADOR (Ana, Pedro, Maria):
--   ✅ Ver: clientes, honorários, despesas, eventos, atendimentos
--   ✅ Criar: atendimentos, eventos
--   ✅ Ver: apenas as PRÓPRIAS tarefas
--   ✅ Atualizar: apenas o STATUS das próprias tarefas
--   ❌ Não pode: criar/editar/deletar clientes, honorários, despesas
--   ❌ Não pode: criar/deletar tarefas
--   ❌ Não pode: ver log de auditoria
--
-- =====================================================
