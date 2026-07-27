-- =====================================================
-- CARSANT — Latitude/longitude do cliente (mapa de distribuição)
-- Execute no Supabase SQL Editor → New query → Cole tudo → Run
-- Script idempotente: pode rodar de novo sem erro.
--
-- Guarda o resultado do geocoding (feito sob demanda no navegador,
-- via Nominatim/OpenStreetMap, um cliente por vez) pra não precisar
-- geocodificar de novo toda vez que abrir o mapa.
-- =====================================================

alter table clientes add column if not exists latitude double precision;
alter table clientes add column if not exists longitude double precision;
