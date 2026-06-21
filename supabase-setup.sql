-- Run this in Supabase Dashboard → SQL Editor

-- 1. User plans table
create table if not exists public.user_plans (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  plan                  text not null default 'free'
                          check (plan in ('free','basic','pro','all_access')),
  generations_used      int  not null default 0,
  generations_reset_at  timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at            timestamptz not null default now(),
  unique (user_id)
);

-- 2. Row Level Security — users can only read/write their own row
alter table public.user_plans enable row level security;

create policy "Users can view own plan"
  on public.user_plans for select
  using (auth.uid() = user_id);

create policy "Users can insert own plan"
  on public.user_plans for insert
  with check (auth.uid() = user_id);

create policy "Users can update own plan"
  on public.user_plans for update
  using (auth.uid() = user_id);

-- 3. Auto-create a free plan row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_plans (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
