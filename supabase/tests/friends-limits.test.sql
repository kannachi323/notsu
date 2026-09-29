begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
values ('11111111-1111-4111-8111-111111111111','limit-owner@example.invalid',now(),false);
insert into auth.sessions(id,user_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
insert into public.profiles(id,username,display_name) values('11111111-1111-4111-8111-111111111111','limit_owner','Owner');
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
select ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid, 'limit-'||i||'@example.invalid', now(),false from generate_series(1,1002) i;
insert into public.profiles(id,username,display_name)
select ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,'limit_'||i,'Player '||i from generate_series(1,1002) i;
insert into public.friendships(user_low,user_high,requested_by,accepted_at,created_at)
select '11111111-1111-4111-8111-111111111111',('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  '11111111-1111-4111-8111-111111111111',now(),'2026-01-01T12:00:00.123456Z' from generate_series(1,55) i;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select is((select count(*) from public.list_connections('friends')),51::bigint,'page fetch is bounded to 50 plus one lookahead');
select set_config('test.cursor_id',(select id::text from public.list_connections('friends') offset 49 limit 1),true);
select set_config('test.cursor_time',(select created_at::text from public.list_connections('friends') offset 49 limit 1),true);
select set_config('test.first_ids',(select jsonb_agg(id)::text from (select id from public.list_connections('friends') limit 50) page),true);
select is((select count(*) from public.list_connections('friends',current_setting('test.cursor_time')::timestamptz,current_setting('test.cursor_id')::uuid)),5::bigint,'cursor keeps every row sharing a timestamp');
select is((select count(*) from public.list_connections('friends',current_setting('test.cursor_time')::timestamptz,current_setting('test.cursor_id')::uuid) row where current_setting('test.first_ids')::jsonb ? row.id::text),0::bigint,'adjacent pages never overlap');
reset role;
insert into public.friendships(user_low,user_high,requested_by,accepted_at)
select '11111111-1111-4111-8111-111111111111',('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  '11111111-1111-4111-8111-111111111111',now() from generate_series(56,200) i;
insert into public.friendships(user_low,user_high,requested_by) values('11111111-1111-4111-8111-111111111111','90000000-0000-4000-8000-000000000201','90000000-0000-4000-8000-000000000201');
set local role authenticated;
select set_config('test.pending',(public.get_connection('90000000-0000-4000-8000-000000000201')->>'id'),true);
select throws_ok($$select public.change_connection('90000000-0000-4000-8000-000000000201','accept',current_setting('test.pending')::uuid)$$,'P0001','friend_limit','acceptance enforces the 200-friend cap');
select throws_ok($$select public.change_connection('90000000-0000-4000-8000-000000000202','send')$$,'P0001','friend_limit','a full friend list cannot send more requests');
select lives_ok($$select public.change_connection('90000000-0000-4000-8000-000000000001','remove',(public.get_connection('90000000-0000-4000-8000-000000000001')->>'id')::uuid)$$,'a full list can remove a friend');
select is(public.change_connection('90000000-0000-4000-8000-000000000201','accept',current_setting('test.pending')::uuid)->>'state','friends','freed capacity allows acceptance');
reset role;
delete from public.friendships where user_low='11111111-1111-4111-8111-111111111111';
insert into public.friendships(user_low,user_high,requested_by)
select '11111111-1111-4111-8111-111111111111',('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  '11111111-1111-4111-8111-111111111111' from generate_series(1,50) i;
set local role authenticated;
select throws_ok($$select public.change_connection('90000000-0000-4000-8000-000000000051','send')$$,'P0001','request_limit','outgoing pending requests are capped at 50');
select is(public.change_connection('90000000-0000-4000-8000-000000000051','block')->>'state','blocked','pending-request cap does not prevent blocking');
reset role;
delete from public.friendships where user_low='11111111-1111-4111-8111-111111111111';
insert into public.friendships(user_low,user_high,requested_by)
select '90000000-0000-4000-8000-000000000002',('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(3,202) i;
set local role authenticated;
select throws_ok($$select public.change_connection('90000000-0000-4000-8000-000000000002','send')$$,'P0001','request_limit','incoming requests are capped at 200');
reset role;
insert into public.blocks(blocker_id,blocked_id)
select '11111111-1111-4111-8111-111111111111',('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,1000) i on conflict do nothing;
set local role authenticated;
select throws_ok($$select public.change_connection('90000000-0000-4000-8000-000000001001','block')$$,'P0001','block_limit','block list has a bounded 1,000-player capacity');
select is(public.change_connection('90000000-0000-4000-8000-000000000001','block')->>'state','blocked','retrying an existing block does not consume capacity');
select is((select count(*) from public.blocks),1000::bigint,'blocked entries are preserved at capacity');
select is((select count(*) from public.list_connections('blocked')),51::bigint,'blocked list uses bounded pagination too');
select * from finish();
rollback;
