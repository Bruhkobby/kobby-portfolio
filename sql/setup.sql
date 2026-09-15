-- ============================================================
--  KOBBY PORTFOLIO — SUPABASE DATABASE SETUP
-- ------------------------------------------------------------
--  How to run this file:
--  1. Open your project at https://supabase.com/dashboard
--  2. In the left sidebar click  SQL Editor
--  3. Click "New query", paste ALL of this file, and click RUN.
--  It is safe to run it more than once (it skips existing parts).
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROJECTS TABLE
-- ------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  category text not null default 'Other',
  client text,
  year text,
  brief text,
  objective text,
  creative_direction text,
  process text,
  result text,
  featured boolean not null default false,
  published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. PROJECT IMAGES TABLE (one project has many images)
-- ------------------------------------------------------------
create table if not exists public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  image_url text not null,
  image_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_images_project_id_idx
  on public.project_images (project_id);

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--    - Anyone (anonymous visitors) may READ published projects.
--    - Only logged-in users (your admin account) may add,
--      edit, delete and read everything.
-- ------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.project_images enable row level security;

-- Public: read published projects only
drop policy if exists "Public read published projects" on public.projects;
create policy "Public read published projects"
  on public.projects for select
  using (published = true);

-- Admin: full control for logged-in users
drop policy if exists "Admin full access on projects" on public.projects;
create policy "Admin full access on projects"
  on public.projects for all
  to authenticated
  using (true)
  with check (true);

-- Public: read images (needed so published project images display)
drop policy if exists "Public read project images" on public.project_images;
create policy "Public read project images"
  on public.project_images for select
  using (true);

-- Admin: full control for logged-in users
drop policy if exists "Admin full access on project images" on public.project_images;
create policy "Admin full access on project images"
  on public.project_images for all
  to authenticated
  using (true)
  with check (true);

-- ------------------------------------------------------------
-- 4. STORAGE BUCKET for uploaded project images
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('project-images', 'project-images', true)
on conflict (id) do nothing;

-- Public: anyone can VIEW uploaded images
drop policy if exists "Public read project images bucket" on storage.objects;
create policy "Public read project images bucket"
  on storage.objects for select
  using (bucket_id = 'project-images');

-- Admin: only logged-in users can upload / update / delete files
drop policy if exists "Admin insert project images" on storage.objects;
create policy "Admin insert project images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'project-images');

drop policy if exists "Admin update project images" on storage.objects;
create policy "Admin update project images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'project-images');

drop policy if exists "Admin delete project images" on storage.objects;
create policy "Admin delete project images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'project-images');

-- ============================================================
--  DONE! Next steps (see README.md):
--  - Create your admin user: Dashboard -> Authentication -> Users
--  - Add your Project URL + anon key to js/config.js
-- ============================================================
