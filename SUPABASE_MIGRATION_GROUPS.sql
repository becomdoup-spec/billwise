-- ============================================================
-- BillWise — GROUPS migration (run once in Supabase SQL Editor)
-- Adds private groups on top of the existing shared space.
-- Existing users/sessions keep group_id = null → the shared space.
-- ============================================================

create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text not null unique,
  owner_email  text not null,
  created_at   timestamptz default now()
);

alter table public.users
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

alter table public.sessions
  add column if not exists group_id uuid references public.groups(id) on delete cascade;

create index if not exists users_group_idx    on public.users(group_id);
create index if not exists sessions_group_idx on public.sessions(group_id);

alter table public.groups enable row level security;

drop policy if exists "allow all anon" on public.groups;
create policy "allow all anon" on public.groups
  for all using (true) with check (true);

-- ============================================================
-- Home group for existing members
-- Creates "Hyderabad Group" (code ABCD) and moves every legacy
-- user and session into it, so nobody is left in an unnamed space.
-- ============================================================

insert into public.groups (name, invite_code, owner_email)
values ('Hyderabad Group', 'abcd', 'niteshm98m@gmail.com')
on conflict (invite_code) do nothing;

update public.users
set group_id = (select id from public.groups where invite_code = 'abcd')
where group_id is null;

update public.sessions
set group_id = (select id from public.groups where invite_code = 'abcd')
where group_id is null;

-- ============================================================
-- Storage: bill-images bucket + permissions (required)
-- The bucket was never created in this project, so bill images
-- have been silently stored as giant base64 strings inside the
-- sessions table instead. With the bucket in place, images go to
-- proper storage, and edited bills can refresh their shared image.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bill-images',
  'bill-images',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

drop policy if exists "allow anon bill image reads" on storage.objects;
create policy "allow anon bill image reads"
on storage.objects for select
using (bucket_id = 'bill-images');

drop policy if exists "allow anon bill image uploads" on storage.objects;
create policy "allow anon bill image uploads"
on storage.objects for insert
with check (bucket_id = 'bill-images');

drop policy if exists "allow anon bill image updates" on storage.objects;
create policy "allow anon bill image updates"
on storage.objects for update
using (bucket_id = 'bill-images')
with check (bucket_id = 'bill-images');

-- Lets the app throw away superseded formatted images after bill edits.
drop policy if exists "allow anon bill image deletes" on storage.objects;
create policy "allow anon bill image deletes"
on storage.objects for delete
using (bucket_id = 'bill-images');
