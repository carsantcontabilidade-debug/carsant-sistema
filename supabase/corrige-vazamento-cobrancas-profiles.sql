-- =====================================================
-- CARSANT — Corrige vazamento de dados via Portal do Cliente (parte 2)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
--
-- Continuação de corrige-vazamento-portal.sql: duas políticas ficaram de
-- fora daquela correção porque não estavam em nenhum arquivo rastreado
-- aqui no projeto.
--
-- 1) cobrancas: a política "Colaborador le cobrancas" foi criada direto
--    no painel do Supabase (a tabela `cobrancas` nunca teve CREATE TABLE
--    neste repositório) usando "auth.uid() is not null" — isso é
--    verdadeiro pra QUALQUER usuário logado, inclusive cliente do Portal.
--    Achado em 2026-07-29 numa revisão de segurança pedida pelo Ronaldo:
--    qualquer cliente logado conseguia ler as cobranças (valor,
--    vencimento, Pix, boleto) de TODOS os outros clientes.
--
-- 2) profiles: a política "colaboradores_veem_nomes_da_equipe"
--    (colaboradores-visiveis.sql) usava "auth.role() = 'authenticated'"
--    sem o mesmo filtro — qualquer cliente do Portal conseguia ler
--    e-mail e função (gestor/colaborador) de toda a equipe.
--
-- Mesmo padrão já usado em clientes/honorarios/despesas/notas_fiscais:
-- soma "cliente_id_do_usuario() is null" pra excluir contas de cliente.
-- =====================================================

drop policy if exists "Colaborador le cobrancas" on cobrancas;
create policy "Colaborador le cobrancas"
  on cobrancas for select
  using (auth.uid() is not null and cliente_id_do_usuario() is null);

drop policy if exists "colaboradores_veem_nomes_da_equipe" on profiles;
create policy "colaboradores_veem_nomes_da_equipe"
  on profiles for select
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);
