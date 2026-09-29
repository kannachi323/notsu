begin;

-- One canonical pair prevents duplicate/crossed requests. IDs identify a specific
-- relationship generation; stale accept/remove actions cannot affect a newer one.
create table public.friendships (
  id uuid not null unique default gen_random_uuid(),
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requested_by in (user_low, user_high))
);
create index friendships_high on public.friendships(user_high);
create index friendships_order on public.friendships(created_at desc, id desc);
create table public.blocks (
  id uuid not null unique default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_target on public.blocks(blocked_id);
create index blocks_order on public.blocks(blocker_id, created_at desc, id desc);
create table private.friend_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null check (requests between 1 and 30)
);
revoke all on public.friendships, public.blocks from public, anon, authenticated;
revoke all on private.friend_request_limits from public, anon, authenticated;
grant select on public.friendships, public.blocks to authenticated;
grant all on public.friendships, public.blocks, private.friend_request_limits to service_role;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table private.friend_request_limits enable row level security;

-- Not exposed by PostgREST. Every definer has a fixed empty search_path and uses
-- qualified tables. These helpers disclose no rows or contact details.
create function private.profile_available(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from auth.users u join public.profiles p on p.id = u.id
  where u.id = p_id and u.email_confirmed_at is not null and u.email is not null
    and not u.is_anonymous and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())); $$;
create function private.pair_blocked(p_one uuid, p_two uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.blocks b
  where (b.blocker_id = p_one and b.blocked_id = p_two)
     or (b.blocker_id = p_two and b.blocked_id = p_one)); $$;
revoke all on function private.profile_available(uuid), private.pair_blocked(uuid,uuid) from public, anon;
grant execute on function private.profile_available(uuid), private.pair_blocked(uuid,uuid) to authenticated;

create policy friendships_participant_read on public.friendships for select to authenticated
using ((select private.account_is_active()) and auth.uid() in (user_low, user_high)
  and not private.pair_blocked(user_low, user_high)
  and private.profile_available(user_low) and private.profile_available(user_high));
create policy blocks_owner_read on public.blocks for select to authenticated
using (blocker_id = (select auth.uid()) and (select private.account_is_active()));

create function public.get_connection(p_target uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := auth.uid(); edge public.friendships; own_block public.blocks;
begin
  if not private.account_is_active() then raise exception using errcode = '42501', message = 'account_unavailable'; end if;
  if actor = p_target then return jsonb_build_object('state','self','id',null); end if;
  select * into own_block from public.blocks where blocker_id = actor and blocked_id = p_target;
  if found then return jsonb_build_object('state','blocked','id',own_block.id); end if;
  if not private.profile_available(actor) or not private.profile_available(p_target)
     or private.pair_blocked(actor,p_target) then return jsonb_build_object('state','unavailable','id',null); end if;
  select * into edge from public.friendships where user_low = least(actor,p_target) and user_high = greatest(actor,p_target);
  if not found then return jsonb_build_object('state','none','id',null); end if;
  return jsonb_build_object('state',case when edge.accepted_at is not null then 'friends'
    when edge.requested_by = actor then 'outgoing' else 'incoming' end,'id',edge.id);
end; $$;
revoke all on function public.get_connection(uuid) from public, anon;
grant execute on function public.get_connection(uuid) to authenticated;

create function public.change_connection(p_target uuid, p_action text, p_expected_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid(); low_id uuid; high_id uuid; edge public.friendships;
  own_block public.blocks; counter private.friend_request_limits;
begin
  if not private.account_is_active() then raise exception using errcode = '42501', message = 'account_unavailable'; end if;
  if p_target is null or p_target = actor or p_action is null or p_action not in ('send','accept','decline','cancel','remove','block','unblock')
    or (p_action in ('send','block') and p_expected_id is not null)
    or (p_action not in ('send','block') and p_expected_id is null)
    then raise exception using errcode = '22023', message = 'invalid_connection'; end if;
  low_id := least(actor,p_target); high_id := greatest(actor,p_target);
  -- All writes for either participant share these locks, in UUID order. This
  -- serializes quotas as well as send/accept/block races, including absent pairs.
  perform id from public.profiles where id in (low_id,high_id) order by id for update;
  if not private.account_is_active() then raise exception using errcode = '42501', message = 'account_unavailable'; end if;
  if not exists (select 1 from public.profiles where id = actor) then
    raise exception using errcode = 'P0001', message = 'profile_required'; end if;
  select * into edge from public.friendships where user_low = low_id and user_high = high_id;
  select * into own_block from public.blocks where blocker_id = actor and blocked_id = p_target;

  if p_action = 'unblock' then
    if own_block.id is not null and own_block.id <> p_expected_id then
      raise exception using errcode = 'P0001', message = 'connection_changed'; end if;
    delete from public.blocks where blocker_id = actor and blocked_id = p_target;
  elsif p_action = 'block' then
    if not exists (select 1 from public.profiles where id = p_target) then
      raise exception using errcode = 'P0001', message = 'connection_unavailable'; end if;
    if own_block.id is null and (select count(*) from public.blocks where blocker_id = actor) >= 1000 then
      raise exception using errcode = 'P0001', message = 'block_limit'; end if;
    insert into public.blocks(blocker_id,blocked_id) values(actor,p_target) on conflict do nothing;
    delete from public.friendships where user_low = low_id and user_high = high_id;
  elsif p_action in ('cancel','decline','remove') then
    if edge.id is not null then
      if edge.id <> p_expected_id or
        (p_action = 'cancel' and (edge.requested_by <> actor or edge.accepted_at is not null)) or
        (p_action = 'decline' and (edge.requested_by = actor or edge.accepted_at is not null)) or
        (p_action = 'remove' and edge.accepted_at is null) then
        raise exception using errcode = 'P0001', message = 'connection_changed'; end if;
      delete from public.friendships where user_low = low_id and user_high = high_id;
    end if;
  else
    if not private.profile_available(p_target) or private.pair_blocked(actor,p_target) then
      raise exception using errcode = 'P0001', message = 'connection_unavailable'; end if;
    if p_action = 'accept' then
      if edge.id is null or edge.id <> p_expected_id or edge.requested_by = actor then
        raise exception using errcode = 'P0001', message = 'connection_changed'; end if;
      if edge.accepted_at is null then
        if (select count(*) from public.friendships where actor in (user_low,user_high) and accepted_at is not null) >= 200
          or (select count(*) from public.friendships where p_target in (user_low,user_high) and accepted_at is not null) >= 200 then
          raise exception using errcode = 'P0001', message = 'friend_limit'; end if;
        update public.friendships set accepted_at = now() where user_low = low_id and user_high = high_id;
      end if;
    elsif edge.id is null then
      if (select count(*) from public.friendships where actor in (user_low,user_high) and accepted_at is not null) >= 200 then
        raise exception using errcode = 'P0001', message = 'friend_limit'; end if;
      if (select count(*) from public.friendships where requested_by = actor and accepted_at is null) >= 50 or
         (select count(*) from public.friendships where p_target in (user_low,user_high) and requested_by <> p_target and accepted_at is null) >= 200 then
        raise exception using errcode = 'P0001', message = 'request_limit'; end if;
      select * into counter from private.friend_request_limits where user_id = actor;
      if counter.window_start > now() - interval '1 hour' and counter.requests >= 30 then
        raise exception using errcode = 'P0001', message = 'request_rate_limited'; end if;
      insert into private.friend_request_limits(user_id,window_start,requests) values(actor,now(),1)
        on conflict (user_id) do update set
          window_start = case when private.friend_request_limits.window_start <= now() - interval '1 hour' then now() else private.friend_request_limits.window_start end,
          requests = case when private.friend_request_limits.window_start <= now() - interval '1 hour' then 1 else private.friend_request_limits.requests + 1 end;
      insert into public.friendships(user_low,user_high,requested_by) values(low_id,high_id,actor);
    end if;
  end if;
  return public.get_connection(p_target);
end; $$;
revoke all on function public.change_connection(uuid,text,uuid) from public, anon;
grant execute on function public.change_connection(uuid,text,uuid) to authenticated;

-- Cursor pagination uses (creation time, generation ID), never a caller's offset.
-- Invoker reads retain RLS even when called directly through PostgREST.
create function public.list_connections(p_list text, p_before_time timestamptz default null, p_before_id uuid default null)
returns table(id uuid, user_id uuid, username text, display_name text, created_at timestamptz, state text)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_list not in ('friends','incoming','outgoing','blocked') or p_list is null or
    ((p_before_time is null) <> (p_before_id is null)) then
    raise exception using errcode = '22023', message = 'invalid_connection'; end if;
  return query
    with entries as (
      select f.id, case when f.user_low = auth.uid() then f.user_high else f.user_low end as other,
        f.created_at, case when f.accepted_at is not null then 'friends'
          when f.requested_by = auth.uid() then 'outgoing' else 'incoming' end as state
      from public.friendships f where p_list <> 'blocked'
      union all
      select b.id, b.blocked_id, b.created_at, 'blocked' from public.blocks b where p_list = 'blocked'
    )
    select e.id, p.id, p.username, p.display_name, e.created_at, e.state
    from entries e join public.profiles p on p.id = e.other
    where e.state = p_list and (p_before_time is null or (e.created_at,e.id) < (p_before_time,p_before_id))
    order by e.created_at desc, e.id desc limit 51;
end; $$;
revoke all on function public.list_connections(text,timestamptz,uuid) from public, anon;
grant execute on function public.list_connections(text,timestamptz,uuid) to authenticated;

commit;
