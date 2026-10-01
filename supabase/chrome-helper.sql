-- Additive companion storage. Does not migrate or modify job_agent_state.
-- Apply in your chosen Supabase project's SQL editor. Create your user in Auth.
begin;
create table if not exists public.career_helper_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'version' = '2'),
 updated_at timestamptz not null default now(),
 constraint career_helper_payload_size check (octet_length(payload::text) <= 5000000)
);
alter table public.career_helper_profiles enable row level security;
alter table public.career_helper_profiles force row level security;
revoke all on public.career_helper_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.career_helper_profiles to authenticated;
drop policy if exists career_helper_owner on public.career_helper_profiles;
create policy career_helper_owner on public.career_helper_profiles
 for all to authenticated using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id);
commit;
