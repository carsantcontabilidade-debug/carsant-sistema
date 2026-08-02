-- =====================================================
-- CARSANT — Restringe dados financeiros a gestor (não colaborador)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- As telas de Honorários, Contas a Pagar, Cobranças e Notas Fiscais só
-- aparecem no menu para gestor, mas as políticas de leitura dessas
-- tabelas liberavam para qualquer funcionário autenticado (colaborador
-- incluso) — o menu escondia a tela, mas não travava o dado. Confirmado
-- com Ronaldo (2026-08) que só gestor deve ver. Escrita já era
-- gestor-only nessas tabelas; só a leitura precisava apertar.
-- =====================================================

drop policy if exists "honorarios_select" on pagamentos_honorarios;
create policy "honorarios_select"
  on pagamentos_honorarios for select
  using (is_gestor());

drop policy if exists "despesas_select" on despesas;
create policy "despesas_select"
  on despesas for select
  using (is_gestor());

drop policy if exists "pag_despesas_select" on pagamentos_despesas;
create policy "pag_despesas_select"
  on pagamentos_despesas for select
  using (is_gestor());

drop policy if exists "staff_ve_notas_fiscais" on notas_fiscais;
create policy "staff_ve_notas_fiscais"
  on notas_fiscais for select
  using (is_gestor());

-- cobrancas: "Gestor acessa todas as cobrancas" (already existing)
-- já cobre tudo (select/insert/update/delete) pra gestor — só remove a
-- política que também liberava pra qualquer colaborador.
drop policy if exists "Colaborador le cobrancas" on cobrancas;
