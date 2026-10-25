-- ============================================================
-- Dollar prices for your pricing packages
-- Run once in Supabase → SQL Editor. Safe to run again.
-- "Price" stays your cedi price; this adds an optional dollar price.
-- ============================================================

alter table public.packages add column if not exists price_usd text;

alter table public.packages drop constraint if exists packages_price_usd_len;
alter table public.packages add constraint packages_price_usd_len
  check (price_usd is null or char_length(price_usd) <= 60);
