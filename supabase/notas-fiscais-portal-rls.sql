-- =====================================================
-- CARSANT — Corrige RLS de notas_fiscais para isolar o Portal do Cliente
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
--
-- A política antiga ("staff_ve_notas_fiscais", using auth.role() =
-- 'authenticated') também valia para clientes logados no Portal, já que
-- eles também são "authenticated" no Supabase — um cliente conseguiria
-- ler notas fiscais de OUTROS clientes. Corrige com o mesmo padrão já
-- usado em cobrancas/documentos_cliente (cliente_id_do_usuario()).
-- =====================================================

drop policy if exists "staff_ve_notas_fiscais" on notas_fiscais;
create policy "staff_ve_notas_fiscais"
  on notas_fiscais for select
  using (auth.role() = 'authenticated' and cliente_id_do_usuario() is null);

drop policy if exists "notas_fiscais_select_proprio" on notas_fiscais;
create policy "notas_fiscais_select_proprio"
  on notas_fiscais for select
  using (cliente_id = cliente_id_do_usuario());
