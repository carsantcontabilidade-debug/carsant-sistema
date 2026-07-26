-- =====================================================
-- CARSANT — Avisos e "não lida" no Chat
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Sem isso, uma mensagem nova do cliente não aparecia como "nova" para
-- a equipe (só descobria abrindo a aba Chat manualmente) e ninguém era
-- avisado. Guarda quem mandou a última mensagem e quando a equipe viu
-- por último — sem precisar marcar mensagem por mensagem como lida.
-- =====================================================
alter table chat_conversas
  add column if not exists ultimo_origem text,
  add column if not exists staff_lido_em timestamptz;

create or replace function chat_toca_conversa()
returns trigger as $$
begin
  update chat_conversas set updated_at = now(), ultimo_origem = new.origem where id = new.conversa_id;
  return new;
end;
$$ language plpgsql security definer;
