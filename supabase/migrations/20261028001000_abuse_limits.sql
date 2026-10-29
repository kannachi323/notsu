begin;

-- Uploads write the archive to object storage before completion checks the
-- library quota, so a full library or a reservation reused with varied archives
-- could keep writing media that is only removed by the retention sweep.
-- Refuse full libraries up front and bound object writes per reservation.
alter table private.map_uploads add column writes smallint not null default 0;
create or replace function public.begin_map_upload(p_id uuid,p_revision text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb; generation uuid; written smallint;
begin
  if not exists(select 1 from private.map_entries where revision=p_revision)
    and ((select count(*) from private.map_entries where owner_id=actor)>=100
      or (select coalesce(sum(bytes),0) from private.map_entries where owner_id=actor)>268435456-22)
    then raise exception using errcode='P0001',message='map_quota'; end if;
  result:=private.reserve_map_upload(p_id,p_revision);
  if result->'entry'<>'null'::jsonb then return result; end if;
  update private.map_uploads set writes=writes+1 where id=(result->>'id')::uuid and owner_id=actor
    returning media_id,writes into generation,written;
  if generation is null then raise exception using errcode='P0001',message='map_upload_expired'; end if;
  -- The raise rolls the increment back, so the count stays at the limit.
  if written>5 then raise exception using errcode='P0001',message='map_upload_attempts'; end if;
  return result || jsonb_build_object('mediaId',generation);
end; $$;

-- Restricted players must not grow the friend graph (docs/moderation.md):
-- their requests were hidden from targets yet still counted against limits.
alter function public.change_connection(uuid,text,uuid) rename to change_connection_checked;
alter function public.change_connection_checked(uuid,text,uuid) set schema private;
revoke all on function private.change_connection_checked(uuid,text,uuid) from public,anon,authenticated;
create function public.change_connection(p_target uuid,p_action text,p_expected_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  -- Inactive accounts keep the original account_unavailable error from the inner function.
  if p_action in ('send','accept') and private.account_is_active() and not private.profile_available(auth.uid())
    then raise exception using errcode='P0001',message='connection_unavailable'; end if;
  return private.change_connection_checked(p_target,p_action,p_expected_id);
end; $$;
revoke all on function public.change_connection(uuid,text,uuid) from public,anon;
grant execute on function public.change_connection(uuid,text,uuid) to authenticated;

-- Match report review: moderators cannot act on another moderator's content.
alter function public.review_map_visibility(text,uuid,uuid,boolean,text) rename to review_map_visibility_checked;
alter function public.review_map_visibility_checked(text,uuid,uuid,boolean,text) set schema private;
revoke all on function private.review_map_visibility_checked(text,uuid,uuid,boolean,text) from public,anon,authenticated;
create function public.review_map_visibility(p_revision text,p_version uuid,p_action uuid,p_hidden boolean,p_note text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if exists(select 1 from private.map_entries e join private.moderators m on m.user_id=e.owner_id where e.revision=p_revision)
    then raise exception using errcode='P0001',message='map_unavailable'; end if;
  return private.review_map_visibility_checked(p_revision,p_version,p_action,p_hidden,p_note);
end; $$;
revoke all on function public.review_map_visibility(text,uuid,uuid,boolean,text) from public,anon;
grant execute on function public.review_map_visibility(text,uuid,uuid,boolean,text) to authenticated;

commit;
