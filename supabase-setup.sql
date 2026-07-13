-- COLAS Lot Pack v125 cloud foundation
-- Run this entire file once in Supabase: SQL Editor -> New query -> Run.

create extension if not exists pgcrypto;

create table if not exists public.lot_pack_submissions (
  id uuid primary key default gen_random_uuid(),
  client_submission_id text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'received' check (status in ('received','processing','emailed','failed','approved')),
  summary jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lot_pack_submissions_user_id_idx
  on public.lot_pack_submissions(user_id);
create index if not exists lot_pack_submissions_received_at_idx
  on public.lot_pack_submissions(received_at desc);

alter table public.lot_pack_submissions enable row level security;

revoke all on table public.lot_pack_submissions from anon;
grant select, insert, update on table public.lot_pack_submissions to authenticated;

drop policy if exists "workers insert own lot packs" on public.lot_pack_submissions;
create policy "workers insert own lot packs"
  on public.lot_pack_submissions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "workers view own lot packs" on public.lot_pack_submissions;
create policy "workers view own lot packs"
  on public.lot_pack_submissions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "workers update own received lot packs" on public.lot_pack_submissions;
create policy "workers update own received lot packs"
  on public.lot_pack_submissions
  for update
  to authenticated
  using ((select auth.uid()) = user_id and status = 'received')
  with check ((select auth.uid()) = user_id and status = 'received');

create or replace function public.set_lot_pack_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_lot_pack_updated_at on public.lot_pack_submissions;
create trigger set_lot_pack_updated_at
before update on public.lot_pack_submissions
for each row execute function public.set_lot_pack_updated_at();
