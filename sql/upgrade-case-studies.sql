-- ============================================================
-- Case-study details for projects
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Adds optional fields: what you did, tools, timeline,
-- key results, and a real client quote.
-- ============================================================

alter table public.projects add column if not exists services        text;
alter table public.projects add column if not exists tools           text;
alter table public.projects add column if not exists duration        text;
alter table public.projects add column if not exists highlights      text;
alter table public.projects add column if not exists client_quote    text;
alter table public.projects add column if not exists client_quote_by text;

-- Keep the text sensible in length (the admin already limits it).
alter table public.projects drop constraint if exists projects_case_extras_len;
alter table public.projects add constraint projects_case_extras_len check (
  char_length(coalesce(services, ''))        <= 300 and
  char_length(coalesce(tools, ''))           <= 300 and
  char_length(coalesce(duration, ''))        <= 60  and
  char_length(coalesce(highlights, ''))      <= 600 and
  char_length(coalesce(client_quote, ''))    <= 600 and
  char_length(coalesce(client_quote_by, '')) <= 120
);

-- Visitors keep read-only access to published projects; admins keep full access.
-- (Table-level grants already cover the new columns.)
