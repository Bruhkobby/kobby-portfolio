-- ============================================================
--  KOBBY PORTFOLIO — ADMIN UPGRADE (run after setup.sql)
--  Adds: inbox status/notes/phone, image alt text, scheduled
--  publishing, site settings, testimonials, clients, packages,
--  privacy-friendly page stats, activity log and blog posts.
--  Safe to run more than once. Nothing existing is deleted.
-- ============================================================

-- ---------- 1. Messages: status, private note, phone ----------
alter table public.messages add column if not exists status text not null default 'new';
alter table public.messages add column if not exists note text;
alter table public.messages add column if not exists phone text;
alter table public.messages add column if not exists replied_at timestamptz;

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('new', 'in_progress', 'replied', 'booked', 'closed'));
alter table public.messages drop constraint if exists messages_lengths_check;
alter table public.messages add constraint messages_lengths_check
  check (char_length(name) <= 200 and char_length(email) <= 320
         and char_length(message) <= 5000 and (phone is null or char_length(phone) <= 40));

-- Visitors can only send a plain new message (no status / note tricks)
drop policy if exists "Public can send messages" on public.messages;
create policy "Public can send messages"
  on public.messages for insert
  to anon, authenticated
  with check (status = 'new' and note is null and read = false and replied_at is null);

-- ---------- 2. Image alt text ----------
alter table public.project_images add column if not exists alt_text text;
alter table public.project_images drop constraint if exists project_images_alt_check;
alter table public.project_images add constraint project_images_alt_check
  check (alt_text is null or char_length(alt_text) <= 300);

-- ---------- 3. Scheduled publishing ----------
alter table public.projects add column if not exists publish_at timestamptz;

drop policy if exists "Public read published projects" on public.projects;
create policy "Public read published projects"
  on public.projects for select
  using (published = true and (publish_at is null or publish_at <= now()));

drop policy if exists "Public read project images" on public.project_images;
create policy "Public read project images"
  on public.project_images for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.published = true
        and (p.publish_at is null or p.publish_at <= now())
    )
  );

-- ---------- 4. Site settings (availability, WhatsApp) ----------
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
drop policy if exists "Public read site settings" on public.site_settings;
create policy "Public read site settings" on public.site_settings for select using (true);
drop policy if exists "Admin manage site settings" on public.site_settings;
create policy "Admin manage site settings" on public.site_settings for all
  to authenticated using (true) with check (true);

insert into public.site_settings (key, value)
values ('general', jsonb_build_object(
  'available', true,
  'whatsapp', '233545414923',
  'whatsapp_message', 'Hi Kobby, I found your portfolio and I''d like to talk about a project.'))
on conflict (key) do nothing;

-- ---------- 5. Testimonials, clients, packages ----------
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null check (char_length(quote) <= 1000),
  name text not null check (char_length(name) <= 120),
  role text check (role is null or char_length(role) <= 160),
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 120),
  logo_url text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 120),
  price_from text not null check (char_length(price_from) <= 60),
  price_note text check (price_note is null or char_length(price_note) <= 60),
  includes text[] not null default '{}',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.testimonials enable row level security;
alter table public.clients enable row level security;
alter table public.packages enable row level security;

drop policy if exists "Public read testimonials" on public.testimonials;
create policy "Public read testimonials" on public.testimonials for select using (published = true);
drop policy if exists "Admin manage testimonials" on public.testimonials;
create policy "Admin manage testimonials" on public.testimonials for all
  to authenticated using (true) with check (true);

drop policy if exists "Public read clients" on public.clients;
create policy "Public read clients" on public.clients for select using (published = true);
drop policy if exists "Admin manage clients" on public.clients;
create policy "Admin manage clients" on public.clients for all
  to authenticated using (true) with check (true);

drop policy if exists "Public read packages" on public.packages;
create policy "Public read packages" on public.packages for select using (published = true);
drop policy if exists "Admin manage packages" on public.packages;
create policy "Admin manage packages" on public.packages for all
  to authenticated using (true) with check (true);

-- ---------- 6. Page stats (no cookies, no IP address, no ID) ----------
create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  path text not null check (char_length(path) between 1 and 200),
  project_slug text check (project_slug is null or char_length(project_slug) <= 120),
  referrer text check (referrer is null or char_length(referrer) <= 120),
  device text not null default 'desktop' check (device in ('mobile', 'tablet', 'desktop')),
  is_entry boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists page_views_created_at_idx on public.page_views (created_at);
alter table public.page_views enable row level security;

drop policy if exists "Visitors can record a page view" on public.page_views;
create policy "Visitors can record a page view" on public.page_views for insert
  to anon, authenticated
  with check (char_length(path) between 1 and 200);
drop policy if exists "Admin reads page views" on public.page_views;
create policy "Admin reads page views" on public.page_views for select to authenticated using (true);
drop policy if exists "Admin deletes page views" on public.page_views;
create policy "Admin deletes page views" on public.page_views for delete to authenticated using (true);

-- Visitors may only fill in these columns (the date is always set by the database)
revoke all on public.page_views from anon, authenticated;
grant insert (path, project_slug, referrer, device, is_entry) on public.page_views to anon, authenticated;
grant select, delete on public.page_views to authenticated;

-- One call returns everything the Stats tab needs. Runs as the caller, so
-- only the signed-in admin gets numbers back.
create or replace function public.analytics_summary(days integer default 30)
returns jsonb
language sql
stable
set search_path = public
as $$
  with w as (
    select * from page_views
    where created_at >= now() - make_interval(days => greatest(1, least(days, 365)))
  )
  select jsonb_build_object(
    'views', (select count(*) from w),
    'visits', (select count(*) from w where is_entry),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'views', v, 'visits', s) order by d)
      from (select (created_at at time zone 'utc')::date d, count(*) v, count(*) filter (where is_entry) s
            from w group by 1) x), '[]'::jsonb),
    'pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'views', c) order by c desc)
      from (select path, count(*) c from w group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('slug', project_slug, 'views', c) order by c desc)
      from (select project_slug, count(*) c from w where project_slug is not null group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'referrers', coalesce((select jsonb_agg(jsonb_build_object('ref', r, 'visits', c) order by c desc)
      from (select coalesce(referrer, 'Direct / unknown') r, count(*) c from w where is_entry group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('device', device, 'visits', c) order by c desc)
      from (select device, count(*) c from w where is_entry group by 1) x), '[]'::jsonb)
  );
$$;

-- ---------- 7. Activity log ----------
create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  action text not null check (char_length(action) <= 80),
  detail text check (detail is null or char_length(detail) <= 300),
  created_at timestamptz not null default now()
);
alter table public.activity_log enable row level security;
drop policy if exists "Admin manages activity log" on public.activity_log;
create policy "Admin manages activity log" on public.activity_log for all
  to authenticated using (true) with check (true);
revoke all on public.activity_log from anon;

-- ---------- 8. Blog posts written in the admin ----------
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  description text not null check (char_length(description) <= 300),
  category text not null default 'Design' check (char_length(category) <= 60),
  body_md text not null default '',
  publish_on date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.blog_posts enable row level security;
-- The site build reads posts that are ready and due; drafts stay private.
drop policy if exists "Public read due blog posts" on public.blog_posts;
create policy "Public read due blog posts" on public.blog_posts for select
  using (status = 'ready' and publish_on <= (now() at time zone 'utc')::date);
drop policy if exists "Admin manage blog posts" on public.blog_posts;
create policy "Admin manage blog posts" on public.blog_posts for all
  to authenticated using (true) with check (true);

-- ---------- 9. Table permissions (anon = visitors) ----------
revoke all on public.site_settings, public.testimonials, public.clients, public.packages, public.blog_posts from anon;
grant select on public.site_settings, public.testimonials, public.clients, public.packages, public.blog_posts to anon;
grant execute on function public.analytics_summary(integer) to authenticated;
revoke execute on function public.analytics_summary(integer) from anon, public;
