begin;

-- Share the same live-session rule with the narrow server-side publication RPC.
create function private.session_is_active(p_user uuid,p_session text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=p_user and s.id::text=p_session and u.email is not null
      and u.email_confirmed_at is not null and u.deleted_at is null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until<=now())
      and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function private.session_is_active(uuid,text) from public,anon,authenticated;
create or replace function private.account_is_active()
returns boolean language sql stable security definer set search_path='' as $$
  select private.session_is_active(auth.uid(),auth.jwt()->>'session_id');
$$;

create table private.map_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  local_id text not null check(char_length(local_id) between 1 and 256),
  unique(owner_id,local_id)
);
create table private.map_entries (
  revision text primary key check(revision ~ '^[a-f0-9]{64}$'),
  set_id uuid not null references private.map_sets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  metadata jsonb not null check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=32768),
  archive_sha256 text not null check(archive_sha256 ~ '^[a-f0-9]{64}$'),
  bytes integer not null check(bytes between 22 and 16777216),
  published_at timestamptz not null default clock_timestamp(),
  visible boolean not null default true,
  moderated boolean not null default false,
  version uuid not null default gen_random_uuid()
);
create index map_entries_order on private.map_entries(published_at desc,revision desc);
create index map_entries_owner on private.map_entries(owner_id);
create table private.map_uploads (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  revision text not null check(revision ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(owner_id,revision)
);
create table private.map_upload_limits (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null check(requests between 1 and 10)
);
create table private.map_reviews (
  id uuid primary key,
  revision text not null references private.map_entries(revision) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  hidden boolean not null,
  note text not null check(char_length(note) between 1 and 500 and note !~ '[[:cntrl:]]'),
  created_at timestamptz not null default clock_timestamp()
);
revoke all on private.map_sets,private.map_entries,private.map_uploads,private.map_upload_limits,private.map_reviews from public,anon,authenticated;
grant all on private.map_sets,private.map_entries,private.map_uploads,private.map_upload_limits,private.map_reviews to service_role;
alter table private.map_sets enable row level security;
alter table private.map_entries enable row level security;
alter table private.map_uploads enable row level security;
alter table private.map_upload_limits enable row level security;
alter table private.map_reviews enable row level security;

create function private.map_result(p_entry private.map_entries)
returns jsonb language sql stable security definer set search_path='' as $$
  select p_entry.metadata || jsonb_build_object('revision',p_entry.revision,'onlineSetId',p_entry.set_id,
    'publisherId',p_entry.owner_id,'publisher',p.username,'bytes',p_entry.bytes,'archiveSha256',p_entry.archive_sha256,
    'publishedAt',p_entry.published_at,'visible',p_entry.visible,'moderated',p_entry.moderated,'version',p_entry.version)
  from public.profiles p where p.id=p_entry.owner_id;
$$;
revoke all on function private.map_result(private.map_entries) from public,anon,authenticated;

create function public.list_published_maps(p_query text default '',p_before_time timestamptz default null,p_before_revision text default null)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_query is null or char_length(p_query)>80 or p_query ~ '[[:cntrl:]]'
    or (p_before_time is null)<>(p_before_revision is null)
    or (p_before_revision is not null and p_before_revision !~ '^[a-f0-9]{64}$') then raise exception using errcode='22023',message='invalid_map'; end if;
  return query select private.map_result(e) from private.map_entries e
    where e.visible and not e.moderated and private.profile_available(e.owner_id)
      and (p_before_time is null or (e.published_at,e.revision)<(p_before_time,p_before_revision))
      and (p_query='' or strpos(lower(concat_ws(' ',e.metadata->>'title',e.metadata->>'artist',e.metadata->>'author',e.metadata->'difficulties')),lower(p_query))>0)
    order by e.published_at desc,e.revision desc limit 31;
end; $$;
create function public.published_map(p_revision text)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.map_result(e) from private.map_entries e where e.revision=p_revision
    and e.visible and not e.moderated and private.profile_available(e.owner_id);
$$;
revoke all on function public.list_published_maps(text,timestamptz,text),public.published_map(text) from public;
grant execute on function public.list_published_maps(text,timestamptz,text),public.published_map(text) to anon,authenticated;

create function public.own_published_maps()
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  return query select private.map_result(e) from private.map_entries e where e.owner_id=auth.uid() order by e.published_at desc,e.revision desc limit 100;
end; $$;
revoke all on function public.own_published_maps() from public,anon;
grant execute on function public.own_published_maps() to authenticated;

-- An ordinary JWT can reserve a bounded upload, but can never mark bytes verified.
create function public.begin_map_upload(p_id uuid,p_revision text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); upload private.map_uploads; entry private.map_entries; quota private.map_upload_limits;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  if p_id is null or p_revision is null or p_revision !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='invalid_map'; end if;
  perform id from public.profiles where id=actor for update;
  if not found then raise exception using errcode='P0001',message='profile_required'; end if;
  if not private.account_is_active() or not private.profile_available(actor) then raise exception using errcode='42501',message='account_unavailable'; end if;
  select * into entry from private.map_entries where revision=p_revision;
  if found then
    if entry.owner_id<>actor then raise exception using errcode='P0001',message='map_owner_conflict'; end if;
    return jsonb_build_object('id',p_id,'entry',private.map_result(entry));
  end if;
  delete from private.map_uploads where owner_id=actor and created_at<clock_timestamp()-interval '30 minutes';
  select * into upload from private.map_uploads where id=p_id or (owner_id=actor and revision=p_revision) order by (id=p_id) desc limit 1;
  if found then
    if upload.owner_id<>actor or upload.revision<>p_revision then raise exception using errcode='P0001',message='map_upload_conflict'; end if;
    return jsonb_build_object('id',upload.id,'entry',null);
  end if;
  select * into quota from private.map_upload_limits where owner_id=actor;
  if found and quota.window_start>clock_timestamp()-interval '24 hours' and quota.requests>=10 then raise exception using errcode='P0001',message='map_rate_limited'; end if;
  insert into private.map_upload_limits values(actor,clock_timestamp(),1) on conflict(owner_id) do update set
    window_start=case when private.map_upload_limits.window_start<=clock_timestamp()-interval '24 hours' then clock_timestamp() else private.map_upload_limits.window_start end,
    requests=case when private.map_upload_limits.window_start<=clock_timestamp()-interval '24 hours' then 1 else private.map_upload_limits.requests+1 end;
  insert into private.map_uploads(id,owner_id,revision) values(p_id,actor,p_revision);
  return jsonb_build_object('id',p_id,'entry',null);
end; $$;
revoke all on function public.begin_map_upload(uuid,text) from public,anon;
grant execute on function public.begin_map_upload(uuid,text) to authenticated;

-- Only the Worker service role reaches this function after validating the archive
-- and a successful immutable object write. Recheck the exact verified live session.
create function public.complete_map_upload(p_id uuid,p_owner uuid,p_session text,p_revision text,p_metadata jsonb,p_sha256 text,p_bytes integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare upload private.map_uploads; entry private.map_entries; map_set uuid;
begin
  perform id from public.profiles where id=p_owner for update;
  if not found or not private.session_is_active(p_owner,p_session) or not private.profile_available(p_owner) then raise exception using errcode='42501',message='account_unavailable'; end if;
  select * into entry from private.map_entries where revision=p_revision;
  if found then
    if entry.owner_id<>p_owner then raise exception using errcode='P0001',message='map_owner_conflict'; end if;
    return private.map_result(entry);
  end if;
  select * into upload from private.map_uploads where id=p_id and owner_id=p_owner and revision=p_revision for update;
  if not found or upload.created_at<clock_timestamp()-interval '30 minutes' then raise exception using errcode='P0001',message='map_upload_expired'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>32768
    or not(p_metadata ?& array['setId','title','artist','author','difficulties'])
    or (p_metadata-array['setId','title','artist','author','difficulties'])<>'{}'::jsonb
    or char_length(p_metadata->>'setId') not between 1 and 256
    or jsonb_typeof(p_metadata->'difficulties')<>'array' or jsonb_array_length(p_metadata->'difficulties') not between 1 and 16
    or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 22 and 16777216
    then raise exception using errcode='22023',message='invalid_map'; end if;
  if (select count(*) from private.map_entries where owner_id=p_owner)>=100
    or (select coalesce(sum(bytes),0) from private.map_entries where owner_id=p_owner)+p_bytes>268435456
    then raise exception using errcode='P0001',message='map_quota'; end if;
  insert into private.map_sets(owner_id,local_id) values(p_owner,p_metadata->>'setId') on conflict(owner_id,local_id) do nothing;
  select id into map_set from private.map_sets where owner_id=p_owner and local_id=p_metadata->>'setId';
  insert into private.map_entries(revision,set_id,owner_id,metadata,archive_sha256,bytes)
    values(p_revision,map_set,p_owner,p_metadata,p_sha256,p_bytes) returning * into entry;
  return private.map_result(entry);
end; $$;
revoke all on function public.complete_map_upload(uuid,uuid,text,text,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.complete_map_upload(uuid,uuid,text,text,jsonb,text,integer) to service_role;

create function public.set_map_visibility(p_revision text,p_version uuid,p_visible boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare entry private.map_entries;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  perform id from public.profiles where id=auth.uid() for update;
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  select * into entry from private.map_entries where revision=p_revision and owner_id=auth.uid() for update;
  if not found then raise exception using errcode='P0001',message='map_unavailable'; end if;
  if p_visible is null or p_version is null then raise exception using errcode='22023',message='invalid_map'; end if;
  if p_visible and (entry.moderated or not private.profile_available(auth.uid())) then raise exception using errcode='42501',message='map_restricted'; end if;
  if entry.visible=p_visible then return private.map_result(entry); end if;
  if entry.version<>p_version then raise exception using errcode='P0001',message='map_changed'; end if;
  update private.map_entries set visible=p_visible,version=gen_random_uuid() where revision=p_revision returning * into entry;
  return private.map_result(entry);
end; $$;
revoke all on function public.set_map_visibility(text,uuid,boolean) from public,anon;
grant execute on function public.set_map_visibility(text,uuid,boolean) to authenticated;

create function public.review_map_visibility(p_revision text,p_version uuid,p_action uuid,p_hidden boolean,p_note text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare entry private.map_entries; previous private.map_reviews;
begin
  if not private.is_moderator() then raise exception using errcode='42501',message='moderator_required'; end if;
  perform user_id from private.moderators where user_id=auth.uid() for share;
  if not found or not private.is_moderator() then raise exception using errcode='42501',message='moderator_required'; end if;
  if p_action is null or p_version is null or p_hidden is null or p_note is null or char_length(p_note) not between 1 and 500
    or p_note !~ '[^[:space:]]' or p_note ~ '[[:cntrl:]]' then raise exception using errcode='22023',message='invalid_map'; end if;
  select * into entry from private.map_entries where revision=p_revision for update;
  if not found or entry.owner_id=auth.uid() then raise exception using errcode='P0001',message='map_unavailable'; end if;
  select * into previous from private.map_reviews where id=p_action;
  if found then
    if previous.revision<>p_revision or previous.actor<>auth.uid() or previous.hidden<>p_hidden or previous.note<>p_note then raise exception using errcode='P0001',message='map_upload_conflict'; end if;
    return private.map_result(entry);
  end if;
  if entry.version<>p_version then raise exception using errcode='P0001',message='map_changed'; end if;
  insert into private.map_reviews(id,revision,actor,hidden,note) values(p_action,p_revision,auth.uid(),p_hidden,p_note);
  update private.map_entries set moderated=p_hidden,version=gen_random_uuid() where revision=p_revision returning * into entry;
  return private.map_result(entry);
end; $$;
revoke all on function public.review_map_visibility(text,uuid,uuid,boolean,text) from public,anon;
grant execute on function public.review_map_visibility(text,uuid,uuid,boolean,text) to authenticated;

commit;
