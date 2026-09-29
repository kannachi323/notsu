begin;

create table private.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
create table private.reports (
  id uuid primary key,
  reporter_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  request_hash text not null,
  reason text not null check (reason in ('spam','harassment','inappropriate_content','impersonation','cheating','other')),
  details text not null check (char_length(details) between 1 and 2000 and octet_length(details)<=8000),
  evidence jsonb not null,
  status text not null default 'open' check (status in ('open','dismissed','action_taken')),
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  decision text,
  decision_note text,
  check (reporter_id is null or target_id is null or reporter_id<>target_id)
);
create index reports_queue on private.reports(status,created_at desc,id desc);
create index reports_owner on private.reports(reporter_id,created_at desc,id desc);
create table private.report_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null check (requests between 1 and 10)
);
create table private.moderation_actions (
  id uuid primary key,
  report_id uuid not null references private.reports(id) on delete cascade,
  moderator_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('dismiss','clear_profile','restrict_7d','restrict_30d','lift_restriction')),
  note text not null,
  created_at timestamptz not null default clock_timestamp()
);
create table private.community_restrictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  report_id uuid references private.reports(id) on delete set null,
  expires_at timestamptz not null,
  note text not null
);
revoke all on private.moderators,private.reports,private.report_limits,private.moderation_actions,private.community_restrictions from public,anon,authenticated;
grant all on private.moderators,private.reports,private.report_limits,private.moderation_actions,private.community_restrictions to service_role;
alter table private.moderators enable row level security;
alter table private.reports enable row level security;
alter table private.report_limits enable row level security;
alter table private.moderation_actions enable row level security;
alter table private.community_restrictions enable row level security;

create function private.community_allowed(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from private.community_restrictions where user_id=p_user and expires_at>now());
$$;
revoke all on function private.community_allowed(uuid) from public,anon;
grant execute on function private.community_allowed(uuid) to authenticated;
create function private.is_moderator()
returns boolean language sql stable security definer set search_path='' as $$
  select private.account_is_active() and private.community_allowed(auth.uid())
    and exists(select 1 from private.moderators where user_id=auth.uid());
$$;
revoke all on function private.is_moderator() from public,anon,authenticated;

-- Keep Auth/account deletion available. Restrict community rules at their shared
-- profile boundary, including direct table writes and public profile reads.
create or replace function private.profile_available(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=p_id and u.email_confirmed_at is not null and u.email is not null
      and not u.is_anonymous and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=now()))
    and private.community_allowed(p_id);
$$;
create function private.profile_readable(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.profile_available(p_id) or (p_id=auth.uid() and private.account_is_active());
$$;
revoke all on function private.profile_readable(uuid) from public;
grant execute on function private.profile_readable(uuid) to anon,authenticated;
alter policy profiles_public_read on public.profiles using (private.profile_readable(id));
alter policy profiles_owner_insert on public.profiles with check (
  id=(select auth.uid()) and (select private.account_is_active()) and private.community_allowed(id));
alter policy profiles_owner_update on public.profiles using (
  id=(select auth.uid()) and (select private.account_is_active()) and private.community_allowed(id))
  with check (id=(select auth.uid()) and (select private.account_is_active()) and private.community_allowed(id));

create function public.moderation_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare restriction private.community_restrictions;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  select * into restriction from private.community_restrictions where user_id=auth.uid() and expires_at>now();
  return jsonb_build_object('moderator',private.is_moderator(),'restriction',
    case when restriction.user_id is null then null else jsonb_build_object('until',restriction.expires_at,'note',restriction.note) end);
end; $$;
revoke all on function public.moderation_access() from public,anon;
grant execute on function public.moderation_access() to authenticated;

-- Restricted players keep account access, but cannot renew visible presence.
-- Preserve the established lease implementation behind a narrow checked wrapper.
alter function public.renew_presence(uuid,integer,boolean) set schema private;
revoke all on function private.renew_presence(uuid,integer,boolean) from public,anon,authenticated;
create function public.renew_presence(p_client uuid,p_sequence integer,p_visible boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_client is null or p_sequence is null or p_sequence<=0 or p_visible is null then raise exception using errcode='22023',message='invalid_presence'; end if;
  perform id from public.profiles where id=auth.uid() for update;
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if not private.community_allowed(auth.uid()) then
    return public.get_presence_settings()||jsonb_build_object('validForMs',0);
  end if;
  return private.renew_presence(p_client,p_sequence,p_visible);
end; $$;
revoke all on function public.renew_presence(uuid,integer,boolean) from public,anon;
grant execute on function public.renew_presence(uuid,integer,boolean) to authenticated;

-- Recheck direct profile writes after row-lock waits, not only at the RLS scan.
create function private.profile_community_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.id=auth.uid() and not private.community_allowed(new.id) then
    raise exception using errcode='42501',message='community_restricted';
  end if;
  return new;
end; $$;
revoke all on function private.profile_community_write() from public,anon,authenticated;
create trigger profile_community_write before insert or update on public.profiles
  for each row execute function private.profile_community_write();

create function private.report_context(p_actor uuid,p_target uuid,p_message uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target public.profiles; message public.direct_messages;
begin
  if p_target is null or p_target=p_actor then raise exception using errcode='22023',message='invalid_report'; end if;
  select * into target from public.profiles where id=p_target;
  if not found then raise exception using errcode='P0001',message='report_unavailable'; end if;
  if p_message is null then
    if not private.profile_available(p_target) then raise exception using errcode='P0001',message='report_unavailable'; end if;
  else
    -- A recipient may report an exact received message after blocking. This
    -- does not reopen history, allow guessing other conversations or allow sends.
    select * into message from public.direct_messages where sender_id=p_target and recipient_id=p_actor and id=p_message;
    if not found then raise exception using errcode='P0001',message='report_unavailable'; end if;
  end if;
  return jsonb_build_object('kind',case when p_message is null then 'profile' else 'message' end,'targetId',p_target,
    'username',case when private.profile_available(p_target) then target.username else null end,
    'displayName',case when private.profile_available(p_target) then target.display_name else 'Unavailable player' end,
    'bio',case when p_message is null then target.bio else '' end,
    'message',case when p_message is null then null else jsonb_build_object('id',message.id,'body',message.body,'createdAt',message.created_at) end);
end; $$;
revoke all on function private.report_context(uuid,uuid,uuid) from public,anon,authenticated;
create function public.report_context(p_target uuid,p_message uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  return private.report_context(auth.uid(),p_target,p_message);
end; $$;
revoke all on function public.report_context(uuid,uuid) from public,anon;
grant execute on function public.report_context(uuid,uuid) to authenticated;

create function private.report_receipt(p_report private.reports)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p_report.id,'kind',p_report.evidence->>'kind',
    'targetName',p_report.evidence->>'displayName','reason',p_report.reason,'status',p_report.status,
    'createdAt',p_report.created_at,'reviewedAt',p_report.reviewed_at);
$$;
revoke all on function private.report_receipt(private.reports) from public,anon,authenticated;
create function public.submit_report(p_id uuid,p_target uuid,p_message uuid,p_reason text,p_details text,p_block boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous private.reports; result private.reports; limits private.report_limits; fingerprint text; evidence jsonb;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_id is null or p_target is null or p_target=actor or p_reason is null
    or p_reason not in ('spam','harassment','inappropriate_content','impersonation','cheating','other')
    or p_details is null or char_length(p_details) not between 1 and 2000 or octet_length(p_details)>8000
    or p_details !~ '[^[:space:]]' or p_details ~ '[\x01-\x08\x0b-\x1f\x7f]' or p_details ~ ('['||chr(128)||'-'||chr(159)||']')
    or p_block is null then raise exception using errcode='22023',message='invalid_report'; end if;
  fingerprint:=encode(extensions.digest(jsonb_build_array(actor,p_target,p_message,p_reason,p_details,p_block)::text,'sha256'),'hex');
  perform id from public.profiles where id in(actor,p_target) order by id for update;
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if not exists(select 1 from public.profiles where id=actor) then raise exception using errcode='P0001',message='profile_required'; end if;
  select * into previous from private.reports where id=p_id;
  if found then
    if previous.reporter_id<>actor or previous.request_hash<>fingerprint then raise exception using errcode='P0001',message='report_conflict'; end if;
    return private.report_receipt(previous);
  end if;
  evidence:=private.report_context(actor,p_target,p_message);
  select * into limits from private.report_limits where user_id=actor;
  if limits.window_start>now()-interval '1 day' and limits.requests>=10 then raise exception using errcode='P0001',message='report_rate_limited'; end if;
  insert into private.report_limits values(actor,now(),1) on conflict(user_id) do update set
    window_start=case when private.report_limits.window_start<=now()-interval '1 day' then now() else private.report_limits.window_start end,
    requests=case when private.report_limits.window_start<=now()-interval '1 day' then 1 else private.report_limits.requests+1 end;
  insert into private.reports(id,reporter_id,target_id,request_hash,reason,details,evidence)
    values(p_id,actor,p_target,fingerprint,p_reason,p_details,evidence) returning * into result;
  if p_block then perform public.change_connection(p_target,'block'); end if;
  return private.report_receipt(result);
end; $$;
revoke all on function public.submit_report(uuid,uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.submit_report(uuid,uuid,uuid,text,text,boolean) to authenticated;

create function public.list_own_reports(p_before_time timestamptz default null,p_before_id uuid default null)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if (p_before_time is null)<>(p_before_id is null) then raise exception using errcode='22023',message='invalid_report'; end if;
  return query select private.report_receipt(r) from private.reports r where r.reporter_id=auth.uid()
    and (p_before_time is null or (r.created_at,r.id)<(p_before_time,p_before_id)) order by r.created_at desc,r.id desc limit 51;
end; $$;
revoke all on function public.list_own_reports(timestamptz,uuid) from public,anon;
grant execute on function public.list_own_reports(timestamptz,uuid) to authenticated;
create function public.moderation_queue(p_status text,p_before_time timestamptz default null,p_before_id uuid default null)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_moderator() then raise exception using errcode='42501',message='moderator_required'; end if;
  if p_status is null or p_status not in ('open','reviewed') or (p_before_time is null)<>(p_before_id is null) then raise exception using errcode='22023',message='invalid_report'; end if;
  return query select private.report_receipt(r) from private.reports r
    where (case when p_status='open' then r.status='open' else r.status<>'open' end)
      and r.reporter_id is distinct from auth.uid() and r.target_id is distinct from auth.uid()
      and (p_before_time is null or (r.created_at,r.id)<(p_before_time,p_before_id))
    order by r.created_at desc,r.id desc limit 51;
end; $$;
revoke all on function public.moderation_queue(text,timestamptz,uuid) from public,anon;
grant execute on function public.moderation_queue(text,timestamptz,uuid) to authenticated;
create function public.moderation_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare report private.reports;
begin
  if not private.is_moderator() then raise exception using errcode='42501',message='moderator_required'; end if;
  select * into report from private.reports where id=p_id;
  if not found or auth.uid() in(report.reporter_id,report.target_id) then raise exception using errcode='P0001',message='report_unavailable'; end if;
  return private.report_receipt(report)||jsonb_build_object('revision',report.revision,'evidence',report.evidence,
    'details',report.details,'reporterId',report.reporter_id,'targetId',report.target_id,'decision',report.decision,'decisionNote',report.decision_note,
    'restriction', (select jsonb_build_object('until',expires_at,'note',note,'thisReport',report_id=report.id) from private.community_restrictions where user_id=report.target_id and expires_at>now()),
    'actions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'note',note,'moderatorId',moderator_id,'createdAt',created_at) order by created_at,id) from private.moderation_actions where report_id=report.id),'[]'::jsonb));
end; $$;
revoke all on function public.moderation_report(uuid) from public,anon;
grant execute on function public.moderation_report(uuid) to authenticated;

create function public.review_report(p_id uuid,p_revision uuid,p_action_id uuid,p_action text,p_note text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); report private.reports; previous private.moderation_actions; generated_name text;
begin
  if not private.is_moderator() then raise exception using errcode='42501',message='moderator_required'; end if;
  -- Serialize role revocation with decisions; roles never come from user metadata.
  perform user_id from private.moderators where user_id=actor for share;
  if not found or not private.is_moderator() then raise exception using errcode='42501',message='moderator_required'; end if;
  if p_id is null or p_revision is null or p_action_id is null or p_action is null
    or p_action not in ('dismiss','clear_profile','restrict_7d','restrict_30d','lift_restriction')
    or p_note is null or char_length(p_note) not between 1 and 500 or octet_length(p_note)>2000
    or p_note !~ '[^[:space:]]' or p_note ~ '[[:cntrl:]]' then raise exception using errcode='22023',message='invalid_report'; end if;
  select * into report from private.reports where id=p_id;
  if not found or actor in(report.reporter_id,report.target_id) then raise exception using errcode='P0001',message='report_unavailable'; end if;
  -- Match account deletion's profile-before-dependent-row order.
  perform id from public.profiles where id=report.target_id for update;
  select * into report from private.reports where id=p_id for update;
  if not found or not private.is_moderator() then raise exception using errcode='42501',message='moderator_required'; end if;
  select * into previous from private.moderation_actions where id=p_action_id;
  if found then
    if previous.report_id<>p_id or previous.moderator_id is distinct from actor or previous.action<>p_action or previous.note<>p_note then
      raise exception using errcode='P0001',message='report_conflict'; end if;
    return public.moderation_report(p_id);
  end if;
  if report.revision<>p_revision or (report.status<>'open' and p_action<>'lift_restriction') then raise exception using errcode='P0001',message='report_changed'; end if;
  if p_action<>'dismiss' then
    if report.target_id is null or exists(select 1 from private.moderators where user_id=report.target_id) then
      raise exception using errcode='P0001',message='protected_target'; end if;
    perform id from public.profiles where id=report.target_id for update;
    if not found then raise exception using errcode='P0001',message='report_unavailable'; end if;
  end if;
  if p_action='clear_profile' then
    if report.evidence->>'kind'<>'profile' then raise exception using errcode='22023',message='invalid_report'; end if;
    -- Do not overwrite a profile edited since this evidence was captured.
    if not exists(select 1 from public.profiles where id=report.target_id and username=report.evidence->>'username'
      and display_name=report.evidence->>'displayName' and bio=report.evidence->>'bio') then raise exception using errcode='P0001',message='profile_changed'; end if;
    loop
      generated_name:='player_'||left(replace(gen_random_uuid()::text,'-',''),13);
      exit when not exists(select 1 from public.profiles where username=generated_name);
    end loop;
    update public.profiles set username=generated_name,display_name='Player',bio='' where id=report.target_id;
  elsif p_action in('restrict_7d','restrict_30d') then
    if exists(select 1 from private.community_restrictions where user_id=report.target_id and expires_at>now()) then raise exception using errcode='P0001',message='restriction_exists'; end if;
    insert into private.community_restrictions values(report.target_id,p_id,clock_timestamp()+case when p_action='restrict_7d' then interval '7 days' else interval '30 days' end,p_note)
      on conflict(user_id) do update set report_id=excluded.report_id,expires_at=excluded.expires_at,note=excluded.note;
    update private.presence_leases set expires_at=least(expires_at,clock_timestamp()) where user_id=report.target_id;
  elsif p_action='lift_restriction' then
    delete from private.community_restrictions where user_id=report.target_id and report_id=p_id and expires_at>now();
    if not found then raise exception using errcode='P0001',message='report_changed'; end if;
  end if;
  insert into private.moderation_actions(id,report_id,moderator_id,action,note) values(p_action_id,p_id,actor,p_action,p_note);
  update private.reports set status=case when p_action='dismiss' then 'dismissed' else 'action_taken' end,
    revision=gen_random_uuid(),reviewed_at=clock_timestamp(),decision=p_action,decision_note=p_note where id=p_id;
  if report.target_id is not null then perform private.signal_presence(report.target_id); end if;
  return public.moderation_report(p_id);
end; $$;
revoke all on function public.review_report(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.review_report(uuid,uuid,uuid,text,text) to authenticated;

-- Only trusted operations may run retention maintenance. Open reports expire
-- after 180 days; reviewed reports/evidence/audits expire 90 days after review.
create function private.purge_reports()
returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
  delete from private.reports where (reviewed_at is null and created_at<now()-interval '180 days')
    or (reviewed_at is not null and reviewed_at<now()-interval '90 days');
  get diagnostics removed=row_count;
  delete from private.community_restrictions where expires_at<now()-interval '90 days';
  return removed;
end; $$;
revoke all on function private.purge_reports() from public,anon,authenticated;
grant execute on function private.purge_reports() to service_role;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('notsu-report-retention','15 3 * * *','select private.purge_reports()');

commit;
