-- =====================================================
-- CARSANT — Certidões visíveis no Portal do Cliente
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- supabase/certidoes.sql criou o painel só pra equipe. Aqui abre
-- leitura pro próprio cliente (status + baixar o PDF), sem mexer na
-- política de staff já existente.
-- =====================================================

-- Cliente vê só as próprias certidões.
drop policy if exists "certidoes_select_proprio" on certidoes;
create policy "certidoes_select_proprio"
  on certidoes for select
  using (cliente_id = cliente_id_do_usuario());

-- Cliente baixa só os arquivos dentro da própria pasta (convenção de
-- path: `${cliente_id}/...`, igual ao bucket documentos-clientes).
drop policy if exists "certidoes_storage_proprio_select" on storage.objects;
create policy "certidoes_storage_proprio_select"
  on storage.objects for select
  using (
    bucket_id = 'certidoes'
    and (storage.foldername(name))[1] = cliente_id_do_usuario()::text
  );

-- Permite o badge de "novo" também para a seção certidões.
alter table portal_leituras drop constraint if exists portal_leituras_secao_check;
alter table portal_leituras add constraint portal_leituras_secao_check
  check (secao in ('honorarios', 'documentos', 'comunicacao', 'certidoes'));
