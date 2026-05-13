-- =====================================================
-- CARSANT CONTABILIDADE — Schema do banco de dados
-- Execute este script no SQL Editor do Supabase
-- =====================================================

-- Habilita extensão UUID
create extension if not exists "uuid-ossp";

-- =====================================================
-- TABELA: profiles (perfis de usuário)
-- =====================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  nome text not null,
  role text not null default 'colaborador' check (role in ('gestor', 'colaborador')),
  email text,
  created_at timestamptz default now()
);

-- Trigger: cria perfil automaticamente ao criar usuário
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- =====================================================
-- TABELA: clientes
-- =====================================================
create table if not exists clientes (
  id uuid default uuid_generate_v4() primary key,
  nome text not null,
  cnpj text,
  regime text,
  valor_honorario numeric(10,2) default 0,
  dia_vencimento integer default 10,
  telefone text,
  email text,
  email2 text,
  tipo text default 'recorrente' check (tipo in ('recorrente', 'temporario')),
  obrigacoes jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================
-- TABELA: pagamentos_honorarios
-- =====================================================
create table if not exists pagamentos_honorarios (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid references clientes on delete cascade,
  mes integer not null,
  ano integer not null,
  pago boolean default false,
  data_pagamento date,
  created_at timestamptz default now(),
  unique(cliente_id, mes, ano)
);

-- =====================================================
-- TABELA: despesas
-- =====================================================
create table if not exists despesas (
  id uuid default uuid_generate_v4() primary key,
  descricao text not null,
  categoria text,
  valor numeric(10,2) default 0,
  dia_vencimento integer default 10,
  fornecedor text,
  recorrencia text default 'mensal' check (recorrencia in ('mensal', 'unica', 'eventual')),
  obs text,
  created_at timestamptz default now()
);

-- =====================================================
-- TABELA: pagamentos_despesas
-- =====================================================
create table if not exists pagamentos_despesas (
  id uuid default uuid_generate_v4() primary key,
  despesa_id uuid references despesas on delete cascade,
  mes integer not null,
  ano integer not null,
  pago boolean default false,
  created_at timestamptz default now(),
  unique(despesa_id, mes, ano)
);

-- =====================================================
-- TABELA: tarefas
-- =====================================================
create table if not exists tarefas (
  id uuid default uuid_generate_v4() primary key,
  descricao text not null,
  cliente_nome text,
  tipo text default 'outro',
  responsavel text,
  prazo date,
  prioridade text default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  status text default 'pendente' check (status in ('pendente', 'andamento', 'concluida', 'atrasada')),
  obs text,
  gerada boolean default false,
  obr_id text,
  mes_ref text,
  created_at timestamptz default now()
);

-- =====================================================
-- TABELA: atendimentos
-- =====================================================
create table if not exists atendimentos (
  id uuid default uuid_generate_v4() primary key,
  cliente_nome text not null,
  canal text default 'whatsapp',
  data date,
  responsavel text,
  assunto text,
  resumo text,
  proximo_passo text,
  created_at timestamptz default now()
);

-- =====================================================
-- TABELA: eventos (agenda)
-- =====================================================
create table if not exists eventos (
  id uuid default uuid_generate_v4() primary key,
  titulo text not null,
  data date not null,
  hora time,
  tipo text default 'outro' check (tipo in ('reuniao', 'prazo', 'visita', 'outro')),
  cliente_nome text,
  responsavel text,
  obs text,
  created_at timestamptz default now()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- Todos os usuários autenticados podem ler/escrever
-- (para controle por role, expanda depois)
-- =====================================================
alter table profiles enable row level security;
alter table clientes enable row level security;
alter table pagamentos_honorarios enable row level security;
alter table despesas enable row level security;
alter table pagamentos_despesas enable row level security;
alter table tarefas enable row level security;
alter table atendimentos enable row level security;
alter table eventos enable row level security;

-- Políticas: usuários autenticados têm acesso total
create policy "Acesso total autenticado" on profiles for all using (auth.role() = 'authenticated');
create policy "Acesso total autenticado" on clientes for all using (auth.role() = 'authenticated');
create policy "Acesso total autenticado" on pagamentos_honorarios for all using (auth.role() = 'authenticated');
create policy "Acesso total autenticado" on despesas for all using (auth.role() = 'authenticated');
create policy "Acesso total autenticado" on pagamentos_despesas for all using (auth.role() = 'authenticated');
create policy "Acesso total autenticado" on tarefas for all using (auth.role() = 'authenticated');
create policy "Acesso total autenticado" on atendimentos for all using (auth.role() = 'authenticated');
create policy "Acesso total autenticado" on eventos for all using (auth.role() = 'authenticated');

-- =====================================================
-- DADOS INICIAIS (opcional — remova se não quiser)
-- Insira seu primeiro usuário gestor após criar a conta
-- UPDATE profiles SET role = 'gestor' WHERE email = 'seu@email.com';
-- =====================================================
