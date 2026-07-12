-- Decode Guardian — Supabase schema
-- Run this once in your Supabase project (SQL Editor → New query → paste → Run)

-- Assessments cache. Keyed by event so repeat queries are free.
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  cache_key text unique not null,
  proxy text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists assessments_proxy_created_idx
  on assessments (proxy, created_at desc);

-- Telegram subscribers. One row per (chat, proxy) pair.
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null,
  proxy text not null,
  created_at timestamptz not null default now(),
  unique (telegram_chat_id, proxy)
);

create index if not exists subscribers_proxy_idx on subscribers (proxy);
create index if not exists subscribers_chat_idx on subscribers (telegram_chat_id);

-- Row-Level Security: locked down. Only the service role key (used server-side) can access.
-- No anon or authenticated user should touch these tables directly.
alter table assessments enable row level security;
alter table subscribers enable row level security;

-- Deny everyone by default. Service role bypasses RLS automatically.
create policy "deny all on assessments" on assessments for all using (false);
create policy "deny all on subscribers" on subscribers for all using (false);
