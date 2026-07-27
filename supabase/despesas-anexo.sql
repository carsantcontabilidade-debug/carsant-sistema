-- =====================================================
-- CARSANT — Anexo (XML/PDF original) em Contas a Pagar
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Guarda o arquivo original (nota fiscal em XML ou boleto em PDF) usado
-- pra pré-preencher o cadastro via importação automática — dá pra
-- conferir depois. Uso só da equipe, nunca aparece no Portal do Cliente.
-- =====================================================

alter table despesas add column if not exists storage_path text;
alter table despesas add column if not exists nome_arquivo text;

insert into storage.buckets (id, name, public)
values ('contas-pagar-anexos', 'contas-pagar-anexos', false)
on conflict (id) do nothing;

drop policy if exists "contas_pagar_anexos_staff" on storage.objects;
create policy "contas_pagar_anexos_staff"
  on storage.objects for all
  using (bucket_id = 'contas-pagar-anexos' and cliente_id_do_usuario() is null)
  with check (bucket_id = 'contas-pagar-anexos' and cliente_id_do_usuario() is null);
