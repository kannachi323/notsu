begin;

create table private.presence_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  visibility text not null check (visibility in ('hidden','friends'))
);
create table private.presence_leases (
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  client_id uuid not null,
  sequence integer not null check (sequence > 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null,
  primary key(session_id,client_id)
);
create index presence_user_expiry on private.presence_leases(user_id,expires_at);
create table private.presence_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null check (requests between 1 and 60)
);
revoke all on private.presence_settings,private.presence_leases,private.presence_limits from public,anon,authenticated;
grant all on private.presence_settings,private.presence_leases,private.presence_limits to service_role;
alter table private.presence_settings enable row level security;
alter table private.presence_leases enable row level security;
alter table private.presence_limits enable row level security;

-- A session existing in Auth is not evidence that its app is online.
create function private.presence_until(p_user uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select max(least(l.expires_at,coalesce(s.not_after,l.expires_at)))
    from private.presence_leases l join auth.sessions s on s.id=l.session_id and s.user_id=l.user_id
    join private.presence_settings p on p.user_id=l.user_id and p.visibility='friends'
    where l.user_id=p_user and private.profile_available(p_user);
$$;
revoke all on function private.presence_until(uuid) from public,anon,authenticated;

-- Same opaque owner-only channel as messaging. No status, peer or timestamp is
-- broadcast. Renewals do not fan out; the audience is invalidated on transitions.
create function private.signal_presence(p_user uuid)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.account_updates(user_id)
    select p.id from public.profiles p where p.id=p_user or exists (
      select 1 from public.friendships f where f.user_low=least(p.id,p_user) and f.user_high=greatest(p.id,p_user)
        and f.accepted_at is not null and not private.pair_blocked(p.id,p_user))
    order by p.id on conflict(user_id) do update set revision=gen_random_uuid();
$$;
revoke all on function private.signal_presence(uuid) from public,anon,authenticated;

create function private.presence_quota(p_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare previous private.presence_limits;
begin
  select * into previous from private.presence_limits where user_id=p_user;
  if previous.window_start>now()-interval '1 minute' and previous.requests>=60 then
    raise exception using errcode='P0001',message='presence_rate_limited'; end if;
  insert into private.presence_limits values(p_user,now(),1) on conflict(user_id) do update set
    window_start=case when private.presence_limits.window_start<=now()-interval '1 minute' then now() else private.presence_limits.window_start end,
    requests=case when private.presence_limits.window_start<=now()-interval '1 minute' then 1 else private.presence_limits.requests+1 end;
end; $$;
revoke all on function private.presence_quota(uuid) from public,anon,authenticated;

create function public.get_presence_settings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  return jsonb_build_object('visibility',coalesce((select visibility from private.presence_settings where user_id=auth.uid()),'hidden'));
end; $$;
revoke all on function public.get_presence_settings() from public,anon;
grant execute on function public.get_presence_settings() to authenticated;

create function public.set_presence_visibility(p_visibility text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); was_online boolean; previous_visibility text;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_visibility is null or p_visibility not in ('hidden','friends') then raise exception using errcode='22023',message='invalid_presence'; end if;
  perform id from public.profiles where id=actor for update;
  if not found then raise exception using errcode='P0001',message='profile_required'; end if;
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  previous_visibility:=coalesce((select visibility from private.presence_settings where user_id=actor),'hidden');
  if previous_visibility=p_visibility then return public.get_presence_settings(); end if;
  was_online:=coalesce(private.presence_until(actor)>clock_timestamp(),false);
  if p_visibility='friends' and coalesce((select visibility from private.presence_settings where user_id=actor),'hidden')<>'friends' then perform private.presence_quota(actor); end if;
  insert into private.presence_settings values(actor,p_visibility) on conflict(user_id) do update set visibility=excluded.visibility;
  if p_visibility='hidden' then
    -- Preserve ordering tombstones: delayed pre-hide requests cannot recreate a
    -- lease after a release, and no request can override a hidden preference.
    update private.presence_leases set expires_at=least(expires_at,clock_timestamp()) where user_id=actor;
  end if;
  if was_online then perform private.signal_presence(actor); else perform private.signal_accounts(actor,actor); end if;
  return public.get_presence_settings();
end; $$;
revoke all on function public.set_presence_visibility(text) from public,anon;
grant execute on function public.set_presence_visibility(text) to authenticated;

create function public.renew_presence(p_client uuid,p_sequence integer,p_visible boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); session uuid; previous private.presence_leases; enabled boolean;
  was_online boolean; is_online boolean; own_until timestamptz; instant timestamptz;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_client is null or p_sequence is null or p_sequence<=0 or p_visible is null then raise exception using errcode='22023',message='invalid_presence'; end if;
  session:=(auth.jwt()->>'session_id')::uuid;
  perform id from public.profiles where id=actor for update;
  if not found then raise exception using errcode='P0001',message='profile_required'; end if;
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  instant:=clock_timestamp();
  was_online:=coalesce(private.presence_until(actor)>instant,false);
  enabled:=coalesce((select visibility='friends' from private.presence_settings where user_id=actor),false);
  select * into previous from private.presence_leases where session_id=session and client_id=p_client;
  if previous.sequence is null or p_sequence>previous.sequence then
    -- Bounded storage. Tombstones survive well beyond the request deadline.
    delete from private.presence_leases where user_id=actor and updated_at<instant-interval '5 minutes';
    if enabled and p_visible then
      perform private.presence_quota(actor);
      if previous.sequence is null and (select count(*) from private.presence_leases where user_id=actor)>=10 then
        raise exception using errcode='P0001',message='presence_window_limit'; end if;
      own_until:=instant+interval '90 seconds';
      insert into private.presence_leases values(actor,session,p_client,p_sequence,own_until,instant)
        on conflict(session_id,client_id) do update set sequence=excluded.sequence,expires_at=excluded.expires_at,updated_at=excluded.updated_at;
    elsif previous.sequence is not null then
      update private.presence_leases set sequence=p_sequence,expires_at=least(expires_at,instant),updated_at=instant where session_id=session and client_id=p_client;
    elsif not p_visible then
      if (select count(*) from private.presence_leases where user_id=actor)>=10 then raise exception using errcode='P0001',message='presence_window_limit'; end if;
      insert into private.presence_leases values(actor,session,p_client,p_sequence,instant,instant);
    end if;
  end if;
  is_online:=coalesce(private.presence_until(actor)>instant,false);
  if was_online<>is_online then perform private.signal_presence(actor); end if;
  select least(l.expires_at,coalesce(s.not_after,l.expires_at)) into own_until
    from private.presence_leases l join auth.sessions s on s.id=l.session_id
    where l.session_id=session and l.client_id=p_client;
  return jsonb_build_object('visibility',case when enabled then 'friends' else 'hidden' end,
    'validForMs',case when enabled then greatest(0,least(90000,coalesce(floor(extract(epoch from (own_until-clock_timestamp()))*1000),0))) else 0 end);
end; $$;
revoke all on function public.renew_presence(uuid,integer,boolean) from public,anon;
grant execute on function public.renew_presence(uuid,integer,boolean) to authenticated;

create function public.friend_presence(p_targets uuid[])
returns table(user_id uuid,online boolean,valid_for_ms integer)
language plpgsql stable security definer set search_path = '' as $$
declare target uuid; expiry timestamptz; duration integer;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_targets is null or cardinality(p_targets) not between 1 and 50 or array_position(p_targets,null) is not null then
    raise exception using errcode='22023',message='invalid_presence'; end if;
  for target in select distinct unnest(p_targets) loop
    expiry:=null;
    if target<>auth.uid() and private.can_message(auth.uid(),target) then expiry:=private.presence_until(target); end if;
    -- Rounded remaining lifetime, never last-seen time, device count or session ID.
    duration:=greatest(0,least(90000,coalesce(floor(extract(epoch from (expiry-clock_timestamp()))/5)*5000,0)));
    return query select target,duration>0,duration;
  end loop;
end; $$;
revoke all on function public.friend_presence(uuid[]) from public,anon;
grant execute on function public.friend_presence(uuid[]) to authenticated;

-- Auth session revocation deletes its leases through the FK. Explicit renew and
-- release transitions are signalled in the RPC; deletion also covers account exit.
create function private.presence_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.expires_at>clock_timestamp() then perform private.signal_presence(old.user_id); end if;
  return null;
end; $$;
revoke all on function private.presence_removed() from public,anon,authenticated;
create trigger presence_session_removed after delete on private.presence_leases for each row execute function private.presence_removed();

commit;
