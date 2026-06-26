# BillWise — Supabase Setup

## Step 1: Create a Supabase project

1. Go to https://supabase.com → New project
2. Note your **Project URL** and **anon public key** from Settings → API

## Step 2: App configuration

BillWise intentionally uses one fixed Supabase project for local and production
so the tested backend is the same backend that goes live. The public Supabase URL
and publishable key live in `src/lib/supabase.ts`.

Only add a `.env` file if you use the optional AI bill parser:
```
VITE_OPENROUTER_API_KEY=...
```

## Step 3: Run the SQL below in Supabase SQL Editor

```sql
-- ============================================================
-- BillWise Schema
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
create table public.users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  pin_hash    text not null,        -- bcrypt hash, min cost 10
  role        text not null check (role in ('admin','user')),
  created_at  timestamptz default now()
);

-- Insert default admin (PIN = 1234, using the app's deterministic PIN hash)
insert into public.users (name, pin_hash, role)
values ('Admin', 'wcoy4', 'admin');
-- For a public production app, move PIN verification to a server-side function
-- and replace this client-side hash with a slow password hash.

-- ============================================================
-- SESSIONS
-- ============================================================
create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  order_id          text not null unique,          -- 8-char human-readable ID
  restaurant_name   text,
  date              date not null,
  bill_image_url    text,                           -- storage object URL
  status            text not null default 'active' check (status in ('active','locked','completed')),
  is_public         boolean not null default true,
  subtotal          numeric(10,2) not null default 0,
  cgst              numeric(10,2) not null default 0,
  sgst              numeric(10,2) not null default 0,
	  total_amount      numeric(10,2) not null default 0,
	  created_by        uuid references public.users(id) on delete set null,
	  created_at        timestamptz default now(),
	  completed_at      timestamptz
	);

-- Existing projects: run this once if sessions were created before visibility controls.
alter table public.sessions
  add column if not exists is_public boolean not null default true;

-- Existing projects: run this once to support completed-bill expiry and reopening.
alter table public.sessions
  add column if not exists completed_at timestamptz;

-- ============================================================
-- BILL ITEMS
-- ============================================================
create table public.bill_items (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  name        text not null,
  quantity    numeric(8,2) not null default 1,
  unit_price  numeric(10,2) not null,
  total_price numeric(10,2) not null,
  category    text,
  created_at  timestamptz default now()
);

create index on public.bill_items(session_id);

-- ============================================================
-- SESSION PARTICIPANTS
-- ============================================================
create table public.session_participants (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  joined_at   timestamptz default now(),
  locked_at   timestamptz,
  unique(session_id, user_id)
);

create index on public.session_participants(session_id);
create index on public.session_participants(user_id);

-- Existing projects: run this once to support locking with zero selections.
alter table public.session_participants
  add column if not exists locked_at timestamptz;

-- ============================================================
-- ITEM SELECTIONS
-- ============================================================
create table public.item_selections (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.sessions(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  item_id             uuid not null references public.bill_items(id) on delete cascade,
  portion_percentage  numeric(5,2) not null default 100
                        check (portion_percentage >= 0 and portion_percentage <= 100),
  locked_at           timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique(session_id, user_id, item_id)
);

create index on public.item_selections(session_id);
create index on public.item_selections(user_id);
create index on public.item_selections(item_id);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger item_selections_updated_at
  before update on public.item_selections
  for each row execute function update_updated_at();

-- ============================================================
-- APP SETTINGS
-- ============================================================
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values
  ('require_pin', 'true'),
  ('show_completed_bills', 'true'),
  ('default_theme', 'light')
on conflict (key) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.users               enable row level security;
alter table public.sessions            enable row level security;
alter table public.bill_items          enable row level security;
alter table public.session_participants enable row level security;
alter table public.item_selections     enable row level security;
alter table public.app_settings        enable row level security;

-- For simplicity, allow anon reads (the PIN acts as the auth layer).
-- In production, use Supabase Auth + proper RLS.
create policy "allow all anon" on public.users               for all using (true);
create policy "allow all anon" on public.sessions            for all using (true);
create policy "allow all anon" on public.bill_items          for all using (true);
create policy "allow all anon" on public.session_participants for all using (true);
create policy "allow all anon" on public.item_selections     for all using (true);
create policy "allow all anon" on public.app_settings        for all using (true) with check (true);

-- Realtime DELETE payloads need old row values for local cleanup.
alter table public.item_selections replica identity full;
alter table public.session_participants replica identity full;

-- ============================================================
-- HELPFUL VIEWS
-- ============================================================

-- Per-user split summary view
create or replace view public.user_split_summary as
select
  sp.session_id,
  sp.user_id,
  u.name                                          as user_name,
  coalesce(sum(bi.total_price * (sel.portion_percentage / 100)), 0) as items_total,
  (s.cgst  / nullif((select count(*) from session_participants p where p.session_id = sp.session_id), 0)) as cgst_share,
  (s.sgst  / nullif((select count(*) from session_participants p where p.session_id = sp.session_id), 0)) as sgst_share,
  coalesce(sum(bi.total_price * (sel.portion_percentage / 100)), 0)
    + (s.cgst / nullif((select count(*) from session_participants p where p.session_id = sp.session_id), 0))
    + (s.sgst / nullif((select count(*) from session_participants p where p.session_id = sp.session_id), 0)) as grand_total,
  sp.locked_at is not null                            as is_locked
from session_participants sp
join users u       on u.id = sp.user_id
join sessions s    on s.id = sp.session_id
left join item_selections sel on sel.session_id = sp.session_id and sel.user_id = sp.user_id
left join bill_items bi       on bi.id = sel.item_id
group by sp.session_id, sp.user_id, u.name, s.cgst, s.sgst, sp.locked_at;

-- Item portion coverage view
create or replace view public.item_portion_coverage as
select
  item_id,
  sum(portion_percentage) as total_claimed_percentage,
  count(*) as selector_count
from item_selections
group by item_id;
```

## Step 4: Storage bucket (for bill images)

Run this once in the SQL Editor:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bill-images',
  'bill-images',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;
```

Then run these policies in the SQL Editor so the app can upload images and create short-lived signed URLs:

```sql
create policy "allow anon bill image reads"
on storage.objects for select
using (bucket_id = 'bill-images');

create policy "allow anon bill image uploads"
on storage.objects for insert
with check (bucket_id = 'bill-images');

create policy "allow anon bill image updates"
on storage.objects for update
using (bucket_id = 'bill-images')
with check (bucket_id = 'bill-images');
```

Enable Realtime for cross-device session and participant updates in Database → Replication, or run:

```sql
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users'
  ) then
    alter publication supabase_realtime add table public.users;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_participants'
  ) then
    alter publication supabase_realtime add table public.session_participants;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'item_selections'
  ) then
    alter publication supabase_realtime add table public.item_selections;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bill_items'
  ) then
    alter publication supabase_realtime add table public.bill_items;
  end if;
end $$;
```

## Step 5: Verify the live connection

The Supabase client and store sync are already wired. Create a member in one browser
and confirm it appears in another browser after the first live refresh.

## Key queries reference

```typescript
// Fetch sessions for user
const { data } = await supabase
  .from('session_participants')
  .select('session_id, sessions(*)')
  .eq('user_id', userId)

// Upsert a selection
await supabase.from('item_selections').upsert({
  session_id, user_id, item_id,
  portion_percentage: portion,
  updated_at: new Date().toISOString(),
}, { onConflict: 'session_id,user_id,item_id' })

// Lock user selections
await supabase.from('item_selections')
  .update({ locked_at: new Date().toISOString() })
  .eq('session_id', sessionId)
  .eq('user_id', userId)

// Get split summary
const { data } = await supabase
  .from('user_split_summary')
  .select('*')
  .eq('session_id', sessionId)
```
