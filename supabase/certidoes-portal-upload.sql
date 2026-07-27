-- =====================================================
-- CARSANT — Cliente também pode cadastrar a própria certidão
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- supabase/certidoes-portal.sql só deu SELECT pro cliente (só via a
-- certidão que a equipe anexasse). Ronaldo pediu praticidade de
-- verdade: o cliente também consegue anexar a própria certidão (ex:
-- já tirou por conta própria), mesma lógica já usada em
-- documentos_cliente.
-- =====================================================

drop policy if exists "certidoes_insert_proprio" on certidoes;
create policy "certidoes_insert_proprio"
  on certidoes for insert
  with check (cliente_id = cliente_id_do_usuario());

drop policy if exists "certidoes_storage_proprio_insert" on storage.objects;
create policy "certidoes_storage_proprio_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'certidoes'
    and (storage.foldername(name))[1] = cliente_id_do_usuario()::text
  );
