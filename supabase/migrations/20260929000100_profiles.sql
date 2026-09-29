begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- A signed JWT can outlive sign-out. Check the live session, verification and ban
-- state for writes as well as at the API boundary. No caller-supplied user ID.
create function private.account_is_active()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    join auth.sessions s on s.user_id = u.id
    where u.id = (select auth.uid())
      and s.id::text = (select auth.jwt() ->> 'session_id')
      and u.email is not null and u.email_confirmed_at is not null
      and u.deleted_at is null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until <= now())
      and (s.not_after is null or s.not_after > now())
  );
$$;
revoke all on function private.account_is_active() from public, anon;
grant execute on function private.account_is_active() to authenticated;

-- PostgREST only exposes public. This wrapper retains the caller's privileges.
create function public.account_is_active()
returns boolean
language sql stable security invoker set search_path = ''
as $$ select private.account_is_active(); $$;
revoke all on function public.account_is_active() from public, anon;
grant execute on function public.account_is_active() to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z][a-z0-9_]{2,19}$'),
  display_name text not null
    check (char_length(display_name) between 1 and 40
      and display_name = btrim(display_name)
      and display_name !~ '[[:cntrl:]]'),
  bio text not null default ''
    check (char_length(bio) <= 280
      and bio = btrim(bio)
      and replace(bio, E'\n', '') !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert (id, username, display_name, bio) on public.profiles to authenticated;
grant update (username, display_name, bio) on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy profiles_public_read on public.profiles for select
to anon, authenticated using (true);
create policy profiles_owner_insert on public.profiles for insert
to authenticated with check (
  id = (select auth.uid()) and (select private.account_is_active())
);
create policy profiles_owner_update on public.profiles for update
to authenticated using (
  id = (select auth.uid()) and (select private.account_is_active())
) with check (
  id = (select auth.uid()) and (select private.account_is_active())
);

create function private.profile_updated_at()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;
revoke all on function private.profile_updated_at() from public, anon, authenticated;
create trigger profile_updated_at before update on public.profiles
for each row execute function private.profile_updated_at();

-- Atomic creation/update without granting UPDATE(id) or client-owned timestamps.
create function public.save_profile(p_username text, p_display_name text, p_bio text)
returns public.profiles
language sql security invoker set search_path = ''
as $$
  insert into public.profiles (id, username, display_name, bio)
  values ((select auth.uid()), p_username, p_display_name, p_bio)
  on conflict (id) do update set
    username = excluded.username, display_name = excluded.display_name, bio = excluded.bio
  returning *;
$$;
revoke all on function public.save_profile(text, text, text) from public, anon;
grant execute on function public.save_profile(text, text, text) to authenticated;

commit;
