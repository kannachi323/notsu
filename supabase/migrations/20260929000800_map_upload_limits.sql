begin;
create table private.map_upload_attempts (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null check(requests between 1 and 20)
);
revoke all on private.map_upload_attempts from public,anon,authenticated;
grant all on private.map_upload_attempts to service_role;
alter table private.map_upload_attempts enable row level security;
alter function public.begin_map_upload(uuid,text) set schema private;
revoke all on function private.begin_map_upload(uuid,text) from public,anon,authenticated;
create function public.begin_map_upload(p_id uuid,p_revision text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid(); quota private.map_upload_attempts;
begin
  if not private.account_is_active() then raise exception using errcode='42501',message='account_unavailable'; end if;
  perform id from public.profiles where id=actor for update;
  if not found then raise exception using errcode='P0001',message='profile_required'; end if;
  if not private.account_is_active() or not private.profile_available(actor) then raise exception using errcode='42501',message='account_unavailable'; end if;
  select * into quota from private.map_upload_attempts where owner_id=actor;
  if found and quota.window_start>clock_timestamp()-interval '1 minute' and quota.requests>=20 then raise exception using errcode='P0001',message='map_upload_throttled'; end if;
  insert into private.map_upload_attempts values(actor,clock_timestamp(),1) on conflict(owner_id) do update set
    window_start=case when private.map_upload_attempts.window_start<=clock_timestamp()-interval '1 minute' then clock_timestamp() else private.map_upload_attempts.window_start end,
    requests=case when private.map_upload_attempts.window_start<=clock_timestamp()-interval '1 minute' then 1 else private.map_upload_attempts.requests+1 end;
  return private.begin_map_upload(p_id,p_revision);
end; $$;
revoke all on function public.begin_map_upload(uuid,text) from public,anon;
grant execute on function public.begin_map_upload(uuid,text) to authenticated;
create function private.purge_map_uploads()
returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
  delete from private.map_uploads where created_at<clock_timestamp()-interval '2 days';
  get diagnostics removed=row_count;
  delete from private.map_upload_attempts where window_start<clock_timestamp()-interval '2 days';
  delete from private.map_upload_limits where window_start<clock_timestamp()-interval '2 days';
  return removed;
end; $$;
revoke all on function private.purge_map_uploads() from public,anon,authenticated;
grant execute on function private.purge_map_uploads() to service_role;
select cron.schedule('notsu-map-upload-retention','30 3 * * *','select private.purge_map_uploads()');
commit;
