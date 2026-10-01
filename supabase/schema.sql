-- Run in the SQL editor of your own Supabase project. No public client reads/writes.
create table if not exists public.job_agent_state (
 id text primary key check (id = 'personal'),
 revision bigint not null default 0 check (revision >= 0),
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 updated_at timestamptz not null default now()
);
alter table public.job_agent_state enable row level security;
alter table public.job_agent_state force row level security;
revoke all on public.job_agent_state from public, anon, authenticated;
grant select, insert, update on public.job_agent_state to service_role;
-- No anon/authenticated policies: the local Node server alone uses the service key.
-- The whole state is updated with `WHERE revision = previous_revision`, which
-- makes daily limits, approvals, and submission locks atomic across processes.
create or replace function public.job_agent_touch_state() returns trigger
language plpgsql set search_path = public as $$
begin
 if new.revision <> old.revision + 1 then
  raise exception 'revision must increase by exactly one';
 end if;
 new.updated_at = now();
 return new;
end $$;
drop trigger if exists job_agent_state_update on public.job_agent_state;
create trigger job_agent_state_update before update on public.job_agent_state
for each row execute function public.job_agent_touch_state();
