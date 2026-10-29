begin;

-- A reservation gets a server-generated storage generation. Reusing a client
-- upload ID after expiry must never reuse an object that retention may delete.
alter table private.map_uploads add column media_id uuid not null default gen_random_uuid() unique;
alter table private.map_entries add column media_id uuid;
create unique index map_entries_media_generation on private.map_entries(media_id) where media_id is not null;
create or replace function private.map_result(p_entry private.map_entries)
returns jsonb language sql stable security definer set search_path='' as $$
  select p_entry.metadata || jsonb_build_object('revision',p_entry.revision,'onlineSetId',p_entry.set_id,
    'publisherId',p_entry.owner_id,'publisher',p.username,'bytes',p_entry.bytes,'archiveSha256',p_entry.archive_sha256,
    'publishedAt',p_entry.published_at,'visible',p_entry.visible,'moderated',p_entry.moderated,'version',p_entry.version,
    'mediaId',p_entry.media_id)
  from public.profiles p where p.id=p_entry.owner_id;
$$;

-- Preserve the existing authenticated reservation/rate-limit implementation.
alter function public.begin_map_upload(uuid,text) rename to reserve_map_upload;
alter function public.reserve_map_upload(uuid,text) set schema private;
revoke all on function private.reserve_map_upload(uuid,text) from public,anon,authenticated;
create function public.begin_map_upload(p_id uuid,p_revision text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare result jsonb; generation uuid;
begin
  result:=private.reserve_map_upload(p_id,p_revision);
  if result->'entry'<>'null'::jsonb then return result; end if;
  select media_id into generation from private.map_uploads where id=(result->>'id')::uuid and owner_id=auth.uid();
  if generation is null then raise exception using errcode='P0001',message='map_upload_expired'; end if;
  return result || jsonb_build_object('mediaId',generation);
end; $$;
revoke all on function public.begin_map_upload(uuid,text) from public,anon;
grant execute on function public.begin_map_upload(uuid,text) to authenticated;

alter function public.complete_map_upload(uuid,uuid,text,text,jsonb,text,integer) set schema private;
revoke all on function private.complete_map_upload(uuid,uuid,text,text,jsonb,text,integer) from public,anon,authenticated;
create function public.complete_map_upload(p_id uuid,p_owner uuid,p_session text,p_revision text,p_metadata jsonb,p_sha256 text,p_bytes integer,p_media uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare generation uuid; entry private.map_entries;
begin
  -- Use the same owner lock as reservation/completion/deletion before reading.
  perform id from public.profiles where id=p_owner for update;
  if not found or not private.session_is_active(p_owner,p_session) or not private.profile_available(p_owner)
    then raise exception using errcode='42501',message='account_unavailable'; end if;
  select * into entry from private.map_entries where revision=p_revision;
  if found then
    return private.complete_map_upload(p_id,p_owner,p_session,p_revision,p_metadata,p_sha256,p_bytes);
  end if;
  select media_id into generation from private.map_uploads where id=p_id and owner_id=p_owner and revision=p_revision;
  if generation is null or (p_media is not null and generation<>p_media) then raise exception using errcode='P0001',message='map_upload_expired'; end if;
  perform private.complete_map_upload(p_id,p_owner,p_session,p_revision,p_metadata,p_sha256,p_bytes);
  update private.map_entries set media_id=generation where revision=p_revision returning * into entry;
  return private.map_result(entry);
end; $$;
revoke all on function public.complete_map_upload(uuid,uuid,text,text,jsonb,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.complete_map_upload(uuid,uuid,text,text,jsonb,text,integer,uuid) to service_role;

create table private.map_media_sweep (
  singleton boolean primary key default true check(singleton),
  cursor text check(cursor is null or char_length(cursor)<=2048)
);
insert into private.map_media_sweep(singleton,cursor) values(true,null);
alter table private.map_media_sweep enable row level security;
revoke all on private.map_media_sweep from public,anon,authenticated;
grant all on private.map_media_sweep to service_role;
create function public.map_media_sweep_cursor()
returns text language sql stable security definer set search_path='' as $$
  select cursor from private.map_media_sweep where singleton;
$$;
create function public.advance_map_media_sweep(p_before text,p_after text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  if char_length(p_after)>2048 then raise exception using errcode='22023',message='invalid_cursor'; end if;
  update private.map_media_sweep set cursor=p_after where singleton and cursor is not distinct from p_before;
  return found;
end; $$;
create function public.referenced_map_media(p_keys text[])
returns text[] language plpgsql stable security definer set search_path='' as $$
declare referenced text[];
begin
  if p_keys is null or cardinality(p_keys)>100 or exists(select 1 from unnest(p_keys) key where char_length(key)>256)
    then raise exception using errcode='22023',message='invalid_media_keys'; end if;
  select coalesce(array_agg(key),'{}'::text[]) into referenced from unnest(p_keys) key
  where exists(select 1 from private.map_entries e where
    key='maps/'||e.owner_id::text||'/'||e.revision||'/'||
      case when e.media_id is null then '' else e.media_id::text||'/' end||e.archive_sha256||'.notsumap')
    or exists(select 1 from private.map_uploads u where u.created_at>clock_timestamp()-interval '30 minutes'
      and key like 'maps/'||u.owner_id::text||'/'||u.revision||'/'||u.media_id::text||'/%');
  -- Withdrawn/moderated entries retain their exact media for restoration.
  return referenced;
end; $$;
revoke all on function public.map_media_sweep_cursor(),public.advance_map_media_sweep(text,text),public.referenced_map_media(text[]) from public,anon,authenticated;
grant execute on function public.map_media_sweep_cursor(),public.advance_map_media_sweep(text,text),public.referenced_map_media(text[]) to service_role;
commit;
