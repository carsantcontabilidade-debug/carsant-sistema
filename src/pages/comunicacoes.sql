-- ============================================================
-- CARSANT CONTABILIDADE — Módulo Comunicação
-- Execute este SQL no Supabase SQL Editor
-- ============================================================

-- 1. Criar tabela comunicacoes
CREATE TABLE IF NOT EXISTS comunicacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Relacionamentos
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Conteúdo
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'email', 'telefone', 'presencial')),
  template TEXT,
  assunto TEXT,
  mensagem TEXT NOT NULL,
  proximo_passo TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'registrado' CHECK (status IN ('enviado', 'pendente', 'registrado'))
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_comunicacoes_cliente_id ON comunicacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_created_at ON comunicacoes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_canal ON comunicacoes(canal);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_responsavel ON comunicacoes(responsavel_id);

-- 3. Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_comunicacoes_updated_at
  BEFORE UPDATE ON comunicacoes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Habilitar Row Level Security
ALTER TABLE comunicacoes ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS
-- Gestor: acesso total
CREATE POLICY "Gestor acessa todas as comunicacoes"
  ON comunicacoes FOR ALL
  USING (is_gestor())
  WITH CHECK (is_gestor());

-- Colaborador: lê e cria (mas só suas próprias)
CREATE POLICY "Colaborador le comunicacoes"
  ON comunicacoes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Colaborador insere comunicacoes"
  ON comunicacoes FOR INSERT
  WITH CHECK (auth.uid() = responsavel_id);

-- 6. Verificar criação
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'comunicacoes'
ORDER BY ordinal_position;
