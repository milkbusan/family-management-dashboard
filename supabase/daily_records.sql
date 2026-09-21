-- Family OS daily records
create table if not exists public.daily_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null unique,
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_records enable row level security;

drop policy if exists "Approved users can view daily records" on public.daily_records;
create policy "Approved users can view daily records"
on public.daily_records for select to authenticated
using (public.is_approved());

drop policy if exists "Approved users can insert daily records" on public.daily_records;
create policy "Approved users can insert daily records"
on public.daily_records for insert to authenticated
with check (public.is_approved() and created_by = auth.uid());

drop policy if exists "Approved users can update daily records" on public.daily_records;
create policy "Approved users can update daily records"
on public.daily_records for update to authenticated
using (public.is_approved())
with check (public.is_approved());

drop policy if exists "Approved users can delete daily records" on public.daily_records;
create policy "Approved users can delete daily records"
on public.daily_records for delete to authenticated
using (public.is_approved());

drop trigger if exists daily_records_updated_at on public.daily_records;
create trigger daily_records_updated_at
before update on public.daily_records
for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.daily_records to authenticated;
