begin;

create table public.direct_messages (
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  id uuid not null,
  sequence bigint not null check (sequence > 0),
  body text not null check (char_length(body) between 1 and 2000 and octet_length(body) <= 8000
    and body ~ '[^[:space:]]' and body !~ '[\x01-\x08\x0b-\x1f\x7f]' and body !~ ('['||chr(128)||'-'||chr(159)||']')),
  created_at timestamptz not null default clock_timestamp(),
  user_low uuid generated always as (least(sender_id,recipient_id)) stored,
  user_high uuid generated always as (greatest(sender_id,recipient_id)) stored,
  primary key (sender_id,id),
  unique (user_low,user_high,sequence),
  check (sender_id <> recipient_id)
);
create table public.message_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  peer_id uuid not null references public.profiles(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  primary key (user_id,peer_id), check (user_id <> peer_id)
);
create table private.message_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_start timestamptz not null, minute_count integer not null,
  day_start timestamptz not null, day_count integer not null
);
-- This is the only replicated table: no messages, peers, block IDs or delete
-- events travel over Realtime. Authorized clients refetch through the live API.
create table public.account_updates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  revision uuid not null default gen_random_uuid()
);
revoke all on public.direct_messages,public.message_reads,public.account_updates from public,anon,authenticated;
revoke all on private.message_limits from public,anon,authenticated;
grant select on public.direct_messages,public.message_reads,public.account_updates to authenticated;
grant all on public.direct_messages,public.message_reads,public.account_updates,private.message_limits to service_role;
alter table public.direct_messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.account_updates enable row level security;
alter table private.message_limits enable row level security;

create function private.can_message(p_one uuid,p_two uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.profile_available(p_one) and private.profile_available(p_two)
    and not private.pair_blocked(p_one,p_two) and exists (
      select 1 from public.friendships where user_low=least(p_one,p_two)
        and user_high=greatest(p_one,p_two) and accepted_at is not null);
$$;
revoke all on function private.can_message(uuid,uuid) from public,anon;
grant execute on function private.can_message(uuid,uuid) to authenticated;
create policy messages_participants on public.direct_messages for select to authenticated
using ((select private.account_is_active()) and auth.uid() in (sender_id,recipient_id)
  and private.can_message(sender_id,recipient_id));
create policy reads_owner on public.message_reads for select to authenticated
using (user_id=(select auth.uid()) and (select private.account_is_active()));
create policy updates_owner on public.account_updates for select to authenticated
using (user_id=(select auth.uid()) and (select private.account_is_active()));

create function private.signal_accounts(p_one uuid,p_two uuid)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.account_updates(user_id) select id from public.profiles
    where id in (p_one,p_two) order by id
    on conflict(user_id) do update set revision=gen_random_uuid();
$$;
revoke all on function private.signal_accounts(uuid,uuid) from public,anon,authenticated;
create function private.signal_community_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; first_id uuid; second_id uuid;
begin
  row_data := case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if TG_TABLE_NAME='friendships' then first_id:=(row_data->>'user_low')::uuid; second_id:=(row_data->>'user_high')::uuid;
  elsif TG_TABLE_NAME='blocks' then first_id:=(row_data->>'blocker_id')::uuid; second_id:=(row_data->>'blocked_id')::uuid;
  else first_id:=(row_data->>'sender_id')::uuid; second_id:=(row_data->>'recipient_id')::uuid; end if;
  perform private.signal_accounts(first_id,second_id);
  return null;
end; $$;
revoke all on function private.signal_community_change() from public,anon,authenticated;
create trigger friendship_updates after insert or update or delete on public.friendships for each row execute function private.signal_community_change();
create trigger block_updates after insert or delete on public.blocks for each row execute function private.signal_community_change();
create trigger message_updates after insert or delete on public.direct_messages for each row execute function private.signal_community_change();
-- Deliberately omit DELETE: Postgres Changes cannot apply RLS to deleted rows.
-- Keep this publication dedicated to sanitized account invalidations.
alter publication supabase_realtime set (publish='insert,update');
alter publication supabase_realtime add table public.account_updates;

create function public.send_message(p_target uuid,p_id uuid,p_body text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); existing public.direct_messages; limits private.message_limits;
  next_sequence bigint; result public.direct_messages;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_target is null or p_target=actor or p_id is null or p_body is null or char_length(p_body) not between 1 and 2000
    or octet_length(p_body)>8000 or p_body !~ '[^[:space:]]' or p_body ~ '[\x01-\x08\x0b-\x1f\x7f]' or p_body ~ ('['||chr(128)||'-'||chr(159)||']') then
    raise exception using errcode='22023',message='invalid_message'; end if;
  -- Same lock order as friendship/block changes, including concurrent sends.
  perform id from public.profiles where id in(actor,p_target) order by id for update;
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if not private.can_message(actor,p_target) then raise exception using errcode='P0001',message='conversation_unavailable'; end if;
  select * into existing from public.direct_messages where sender_id=actor and id=p_id;
  if found then
    if existing.recipient_id<>p_target or existing.body<>p_body then raise exception using errcode='P0001',message='message_conflict'; end if;
    return jsonb_build_object('id',existing.id,'senderId',actor,'sequence',existing.sequence::text,'body',existing.body,'createdAt',existing.created_at);
  end if;
  select * into limits from private.message_limits where user_id=actor;
  if (limits.minute_start>now()-interval '1 minute' and limits.minute_count>=30)
    or (limits.day_start>now()-interval '1 day' and limits.day_count>=1000) then
    raise exception using errcode='P0001',message='message_rate_limited'; end if;
  insert into private.message_limits values(actor,now(),1,now(),1) on conflict(user_id) do update set
    minute_start=case when private.message_limits.minute_start<=now()-interval '1 minute' then now() else private.message_limits.minute_start end,
    minute_count=case when private.message_limits.minute_start<=now()-interval '1 minute' then 1 else private.message_limits.minute_count+1 end,
    day_start=case when private.message_limits.day_start<=now()-interval '1 day' then now() else private.message_limits.day_start end,
    day_count=case when private.message_limits.day_start<=now()-interval '1 day' then 1 else private.message_limits.day_count+1 end;
  select coalesce(max(sequence),0)+1 into next_sequence from public.direct_messages
    where user_low=least(actor,p_target) and user_high=greatest(actor,p_target);
  insert into public.direct_messages(sender_id,recipient_id,id,sequence,body) values(actor,p_target,p_id,next_sequence,p_body) returning * into result;
  return jsonb_build_object('id',result.id,'senderId',actor,'sequence',result.sequence::text,'body',result.body,'createdAt',result.created_at);
end; $$;
revoke all on function public.send_message(uuid,uuid,text) from public,anon;
grant execute on function public.send_message(uuid,uuid,text) to authenticated;

create function public.list_messages(p_target uuid,p_before bigint default null)
returns table(id uuid,sender_id uuid,sequence text,body text,created_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_target is null or p_target=auth.uid() or p_before<=0 then raise exception using errcode='22023',message='invalid_message'; end if;
  if not private.can_message(auth.uid(),p_target) then raise exception using errcode='P0001',message='conversation_unavailable'; end if;
  return query select m.id,m.sender_id,m.sequence::text,m.body,m.created_at from public.direct_messages m
    where m.user_low=least(auth.uid(),p_target) and m.user_high=greatest(auth.uid(),p_target)
      and (p_before is null or m.sequence<p_before) order by m.sequence desc limit 51;
end; $$;
revoke all on function public.list_messages(uuid,bigint) from public,anon;
grant execute on function public.list_messages(uuid,bigint) to authenticated;

create function public.mark_messages_read(p_target uuid,p_sequence bigint)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare changed integer;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  perform id from public.profiles where id in(auth.uid(),p_target) order by id for update;
  if not private.account_is_active() or not private.can_message(auth.uid(),p_target) then raise exception using errcode='P0001',message='conversation_unavailable'; end if;
  if not exists(select 1 from public.direct_messages where user_low=least(auth.uid(),p_target)
    and user_high=greatest(auth.uid(),p_target) and sequence=p_sequence) then raise exception using errcode='22023',message='invalid_message'; end if;
  insert into public.message_reads values(auth.uid(),p_target,p_sequence) on conflict(user_id,peer_id)
    do update set sequence=excluded.sequence where public.message_reads.sequence<excluded.sequence;
  get diagnostics changed = row_count;
  -- Only your own devices receive read-position invalidations; no read receipt.
  if changed>0 then perform private.signal_accounts(auth.uid(),auth.uid()); end if;
end; $$;
revoke all on function public.mark_messages_read(uuid,bigint) from public,anon;
grant execute on function public.mark_messages_read(uuid,bigint) to authenticated;

create function public.list_conversations(p_before_time timestamptz default null,p_before_id uuid default null)
returns table(user_id uuid,username text,display_name text,preview text,updated_at timestamptz,unread integer)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if (p_before_time is null)<>(p_before_id is null) then raise exception using errcode='22023',message='invalid_message'; end if;
  return query select p.id,p.username,p.display_name,left(last_message.body,100),coalesce(last_message.created_at,f.accepted_at),
    (select count(*)::integer from (select 1 from public.direct_messages m where m.user_low=f.user_low and m.user_high=f.user_high
      and m.recipient_id=auth.uid() and m.sequence>coalesce(r.sequence,0) limit 100) unread_messages)
    from public.friendships f join public.profiles p on p.id=case when f.user_low=auth.uid() then f.user_high else f.user_low end
    left join lateral (select m.body,m.created_at from public.direct_messages m where m.user_low=f.user_low and m.user_high=f.user_high order by m.sequence desc limit 1) last_message on true
    left join public.message_reads r on r.user_id=auth.uid() and r.peer_id=p.id
    where f.accepted_at is not null and (p_before_time is null or (coalesce(last_message.created_at,f.accepted_at),p.id)<(p_before_time,p_before_id))
    order by coalesce(last_message.created_at,f.accepted_at) desc,p.id desc limit 51;
end; $$;
revoke all on function public.list_conversations(timestamptz,uuid) from public,anon;
grant execute on function public.list_conversations(timestamptz,uuid) to authenticated;

commit;
