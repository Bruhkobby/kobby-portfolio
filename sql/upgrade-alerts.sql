-- ============================================================
-- Instant alerts when someone sends you a message
-- Run once in Supabase → SQL Editor. Safe to run again.
--
-- After running this, the alerts stay OFF until you add your
-- details with ONE of the lines at the bottom of this file.
-- Your WhatsApp key is stored in a private table that visitors
-- and the website can never read.
-- ============================================================

create extension if not exists pg_net with schema extensions;

-- One private settings row. No one except you (in the SQL Editor) can read or change it.
create table if not exists public.alert_config (
  id            integer primary key default 1 check (id = 1),
  channel       text    not null default 'off' check (channel in ('off', 'whatsapp', 'ntfy')),
  phone         text,
  apikey        text,
  ntfy_topic    text,
  admin_url     text    not null default 'https://bruhkobby.github.io/kobby-portfolio/admin/',
  last_alert_at timestamptz
);
alter table public.alert_config enable row level security;
revoke all on public.alert_config from public, anon, authenticated;
insert into public.alert_config (id) values (1) on conflict (id) do nothing;

-- Sends the alert. Never blocks or breaks the visitor's message, even if the alert fails.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c      public.alert_config%rowtype;
  unread integer;
  txt    text;
begin
  select * into c from public.alert_config where id = 1;
  if not found or c.channel = 'off' then
    return new;
  end if;

  -- At most one alert a minute, so a burst of messages can't flood your phone.
  -- (They all still appear in your inbox, and the alert says how many are unread.)
  if c.last_alert_at is not null and c.last_alert_at > now() - interval '60 seconds' then
    return new;
  end if;

  begin
    select count(*) into unread from public.messages where status = 'new';

    txt := 'New message on your portfolio' || E'\n' ||
           'From: ' || left(new.name, 60) || E'\n' ||
           left(regexp_replace(new.message, '\s+', ' ', 'g'), 220) || E'\n' ||
           'Reply to: ' || new.email || coalesce(' / ' || nullif(new.phone, ''), '') || E'\n' ||
           'Unread in inbox: ' || unread;

    if c.channel = 'whatsapp' and c.phone is not null and c.apikey is not null then
      perform net.http_get(
        url                  := 'https://api.callmebot.com/whatsapp.php',
        params               := jsonb_build_object('phone', c.phone, 'text', txt, 'apikey', c.apikey),
        timeout_milliseconds := 5000
      );
    elsif c.channel = 'ntfy' and c.ntfy_topic is not null then
      perform net.http_post(
        url                  := 'https://ntfy.sh/',
        body                 := jsonb_build_object(
                                  'topic',    c.ntfy_topic,
                                  'title',    'New portfolio message',
                                  'message',  txt,
                                  'priority', 4,
                                  'click',    c.admin_url),
        headers              := jsonb_build_object('Content-Type', 'application/json'),
        timeout_milliseconds := 5000
      );
    end if;

    update public.alert_config set last_alert_at = now() where id = 1;
  exception when others then
    null;  -- an alert problem must never stop someone contacting you
  end;

  return new;
end $$;

revoke all on function public.notify_new_message() from public, anon, authenticated;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_new_message();


-- ============================================================
-- STEP 2 — turn alerts on. Run ONE of these (not both), after
-- replacing the example values. Run it as its own query.
-- ============================================================

-- A) WhatsApp (CallMeBot). Use your number with +233 and the key the bot sent you:
--
--   update public.alert_config
--      set channel = 'whatsapp', phone = '+233545414923', apikey = 'PASTE-YOUR-KEY-HERE'
--    where id = 1;

-- B) Phone push (ntfy app). Choose a long random topic name nobody could guess,
--    then subscribe to the same topic in the free ntfy app:
--
--   update public.alert_config
--      set channel = 'ntfy', ntfy_topic = 'kobby-portfolio-PICK-SOMETHING-LONG-AND-RANDOM'
--    where id = 1;

-- To turn alerts off again:
--
--   update public.alert_config set channel = 'off' where id = 1;
