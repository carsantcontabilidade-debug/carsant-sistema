-- =====================================================
-- CARSANT — Baixa manual de cobrança (dinheiro/Pix direto/transferência)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Antes, a única forma de "resolver" uma cobrança vencida paga por
-- fora (ex: dinheiro) era cancelar e gerar outra — mas cancelada não
-- entra no total de "Recebido", perdendo o registro do faturamento.
-- Agora dá pra dar baixa direto (status vira "paga" de verdade),
-- guardando como foi pago pra diferenciar de uma baixa confirmada
-- pelo banco (Inter).
-- =====================================================

alter table cobrancas add column if not exists forma_pagamento text;
