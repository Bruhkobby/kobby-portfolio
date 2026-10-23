-- ============================================================
--  KOBBY PORTFOLIO — SECURITY HARDENING (run after upgrade-admin.sql)
--
--  1. Only YOU count as the admin. Until now every rule said "any
--     signed-in account", which is only safe if nobody else can create
--     an account. After this, a stranger with an account sees nothing.
--  2. Flood protection: caps how fast messages and page counts can be
--     added, so nobody can fill your inbox or database with junk.
--  3. Visitors lose every database permission they don't need.
--  4. Uploads: only images and video, 50 MB at most.
--
--  Safe to run more than once. Nothing is deleted.
--  How: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- ============================================================

-- ---------- 0. Safety check: the admin account must exist ----------
do $$
begin
  if not exists (select 1 from auth.users) then
    raise exception 'No admin account found - stopping so you are not locked out.';
  end if;
end $$;

-- ---------- 1. Who is the admin? ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;      -- no policies: nobody can read it through the website
revoke all on public.admins from anon, authenticated;

-- The first account ever created (the one you made when setting up) is the owner.
insert into public.admins (user_id, note)
select id, 'site owner' from auth.users order by created_at asc limit 1
on conflict (user_id) do nothing;

-- True only for the owner. Once two-step sign-in (an authenticator app) is turned
-- on for the owner, a password alone is no longer enough: the session must also
-- have passed the 6-digit code check (aal2).
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return false; end if;
  if not exists (select 1 from public.admins where user_id = uid) then return false; end if;
  if exists (select 1 from auth.mfa_factors where user_id = uid and status = 'verified')
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    return false;
  end if;
  return true;
end $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------- 2. Replace every "any signed-in user" rule with "the admin" ----------
drop policy if exists "Admin manages activity log" on public.activity_log;
create policy "Admin manages activity log" on public.activity_log for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admin manage blog posts" on public.blog_posts;
create policy "Admin manage blog posts" on public.blog_posts for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admin manage clients" on public.clients;
create policy "Admin manage clients" on public.clients for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admin full access on messages" on public.messages;
create policy "Admin full access on messages" on public.messages for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admin manage packages" on public.packages;
create policy "Admin manage packages" on public.packages for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admin deletes page views" on public.page_views;
create policy "Admin deletes page views" on public.page_views for delete
  to authenticated using ((select public.is_admin()));
drop policy if exists "Admin reads page views" on public.page_views;
create policy "Admin reads page views" on public.page_views for select
  to authenticated using ((select public.is_admin()));

drop policy if exists "Admin full access on project images" on public.project_images;
create policy "Admin full access on project images" on public.project_images for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admin full access on projects" on public.projects;
create policy "Admin full access on projects" on public.projects for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admin manage site settings" on public.site_settings;
create policy "Admin manage site settings" on public.site_settings for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admin manage testimonials" on public.testimonials;
create policy "Admin manage testimonials" on public.testimonials for all
  to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- uploaded files
drop policy if exists "Admin insert project images" on storage.objects;
create policy "Admin insert project images" on storage.objects for insert
  to authenticated with check (bucket_id = 'project-images' and (select public.is_admin()));
drop policy if exists "Admin update project images" on storage.objects;
create policy "Admin update project images" on storage.objects for update
  to authenticated using (bucket_id = 'project-images' and (select public.is_admin()));
drop policy if exists "Admin delete project images" on storage.objects;
create policy "Admin delete project images" on storage.objects for delete
  to authenticated using (bucket_id = 'project-images' and (select public.is_admin()));

-- Nobody but you can LIST the uploads folder. Pictures still load for visitors
-- because the bucket is public (each picture has its own public link).
drop policy if exists "Public read project images bucket" on storage.objects;
drop policy if exists "Admin read project images" on storage.objects;
create policy "Admin read project images" on storage.objects for select
  to authenticated using (bucket_id = 'project-images' and (select public.is_admin()));

-- ---------- 3. Visitors only get the permissions they need ----------
revoke all on public.projects, public.project_images from anon;
grant select on public.projects, public.project_images to anon;
revoke all on public.messages from anon;
grant insert on public.messages to anon;

-- ---------- 4. Message checks and flood protection ----------
alter table public.messages drop constraint if exists messages_email_check;
alter table public.messages add constraint messages_email_check
  check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

create or replace function public.limit_message_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.messages where created_at > now() - interval '10 minutes') >= 25
     or (select count(*) from public.messages where lower(email) = lower(new.email) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many messages right now. Please try again a little later.';
  end if;
  return new;
end $$;
revoke all on function public.limit_message_rate() from public, anon, authenticated;
drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit before insert on public.messages
  for each row execute function public.limit_message_rate();

alter table public.page_views drop constraint if exists page_views_shape_check;
alter table public.page_views add constraint page_views_shape_check
  check (path ~ '^[a-z0-9._/-]{1,200}$'
         and (project_slug is null or project_slug ~ '^[a-z0-9-]{1,120}$')
         and (referrer is null or referrer ~ '^[a-z0-9.-]{1,120}$'));

create or replace function public.limit_page_view_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.page_views where created_at > now() - interval '10 minutes') >= 1500 then
    raise exception 'Too many page views right now.';
  end if;
  return new;
end $$;
revoke all on function public.limit_page_view_rate() from public, anon, authenticated;
drop trigger if exists page_views_rate_limit on public.page_views;
create trigger page_views_rate_limit before insert on public.page_views
  for each row execute function public.limit_page_view_rate();

-- ---------- 5. Uploads: images and video only, 50 MB maximum ----------
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
                               'video/mp4', 'video/webm', 'video/quicktime']
where id = 'project-images';
