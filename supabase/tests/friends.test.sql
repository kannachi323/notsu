begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('11111111-1111-4111-8111-111111111111','friend-a@example.invalid',now(),false),
('22222222-2222-4222-8222-222222222222','friend-b@example.invalid',now(),false),
('33333333-3333-4333-8333-333333333333','friend-c@example.invalid',now(),false),
('44444444-4444-4444-8444-444444444444','friend-d@example.invalid',null,false);
insert into auth.sessions(id,user_id) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444');
insert into public.profiles(id,username,display_name) values
('11111111-1111-4111-8111-111111111111','friend_one','One'),
('22222222-2222-4222-8222-222222222222','friend_two','Two'),
('33333333-3333-4333-8333-333333333333','friend_three','Three'),
('44444444-4444-4444-8444-444444444444','friend_four','Four');
select ok((select relrowsecurity from pg_class where oid='public.friendships'::regclass), 'friendships enforce RLS');
select ok((select relrowsecurity from pg_class where oid='public.blocks'::regclass), 'blocks enforce RLS');
select ok(not has_table_privilege('authenticated','public.friendships','INSERT,UPDATE,DELETE,TRUNCATE'), 'clients cannot bypass friendship transitions');
select ok(not has_table_privilege('authenticated','public.blocks','INSERT,UPDATE,DELETE,TRUNCATE'), 'clients cannot bypass block transitions');
select ok(not has_table_privilege('anon','public.friendships','SELECT'), 'friend lists are private');
select ok(not has_function_privilege('anon','public.change_connection(uuid,text,uuid)','EXECUTE'), 'guests cannot mutate connections');
select ok(not has_function_privilege('anon','public.get_connection(uuid)','EXECUTE'), 'guests cannot inspect relationships');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select is(public.get_connection(auth.uid())->>'state','self','self has no friend action');
select throws_ok($$select public.change_connection(auth.uid(),'send')$$,'22023',null,'self requests fail');
select throws_ok($$select public.change_connection('44444444-4444-4444-8444-444444444444','send')$$,'P0001','connection_unavailable','unverified target cannot receive requests');
select is(public.change_connection('22222222-2222-4222-8222-222222222222','send')->>'state','outgoing','sender creates an outgoing request');
select set_config('test.edge_id',(public.get_connection('22222222-2222-4222-8222-222222222222')->>'id'),true);
select is(public.change_connection('22222222-2222-4222-8222-222222222222','send')->>'id',current_setting('test.edge_id'),'sending twice preserves generation');
select is((select count(*) from public.list_connections('outgoing')),1::bigint,'sender sees outgoing list');
select is((select count(*) from public.list_connections('incoming')),0::bigint,'sender cannot treat it as incoming');
select throws_ok($$select public.change_connection('22222222-2222-4222-8222-222222222222','accept',current_setting('test.edge_id')::uuid)$$,'P0001','connection_changed','sender cannot accept their own request');
select throws_ok($$select public.change_connection('22222222-2222-4222-8222-222222222222','decline',current_setting('test.edge_id')::uuid)$$,'P0001','connection_changed','sender cannot impersonate the recipient');
select throws_ok($$select public.change_connection('22222222-2222-4222-8222-222222222222','cancel')$$,'22023',null,'mutations require an expected generation');
select throws_ok($$update public.friendships set accepted_at=now()$$,'42501',null,'direct update cannot accept requests');
select throws_ok($$select * from private.friend_request_limits$$,'42501',null,'limits are not exposed to clients');

select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
select is((select count(*) from public.friendships),0::bigint,'third parties cannot read friendships');
select is((select count(*) from public.list_connections('outgoing')),0::bigint,'third parties cannot list requests');
select throws_ok($$select public.change_connection('22222222-2222-4222-8222-222222222222','accept',current_setting('test.edge_id')::uuid)$$,'P0001','connection_changed','third party cannot accept another pair');

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is(public.get_connection('11111111-1111-4111-8111-111111111111')->>'state','incoming','recipient sees incoming request');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','send')->>'state','incoming','crossed request still needs explicit acceptance');
select is((select count(*) from public.friendships),1::bigint,'crossed request creates no duplicate pair');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','accept',current_setting('test.edge_id')::uuid)->>'state','friends','recipient accepts mutual friendship');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','accept',current_setting('test.edge_id')::uuid)->>'state','friends','accept retry is idempotent');
select is((select count(*) from public.list_connections('friends')),1::bigint,'accepted friend is listed');
select is((select count(*) from public.list_connections('incoming')),0::bigint,'accepted request leaves incoming list');
select throws_ok($$select public.change_connection('11111111-1111-4111-8111-111111111111','decline',current_setting('test.edge_id')::uuid)$$,'P0001','connection_changed','stale decline does not remove an accepted friend');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','block')->>'state','blocked','blocking is recorded for its owner');
select set_config('test.block_id',(public.get_connection('11111111-1111-4111-8111-111111111111')->>'id'),true);
select is((select count(*) from public.friendships),0::bigint,'blocking removes friendship atomically');
select is((select count(*) from public.list_connections('blocked')),1::bigint,'owner can manage blocks');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','block')->>'id',current_setting('test.block_id'),'blocking twice preserves generation');

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select is((select count(*) from public.blocks),0::bigint,'blocked person cannot read someone else''s block list');
select is(public.get_connection('22222222-2222-4222-8222-222222222222')->>'state','unavailable','blocked recipient is generically unavailable');
select throws_ok($$select public.change_connection('22222222-2222-4222-8222-222222222222','send')$$,'P0001','connection_unavailable','blocked requests fail at the database');
select is(public.change_connection('22222222-2222-4222-8222-222222222222','unblock',current_setting('test.block_id')::uuid)->>'state','unavailable','cannot unblock on someone else''s behalf');
select is((select count(*) from public.profiles where username in ('friend_one','friend_two','friend_three','friend_four')),4::bigint,'blocking does not promise public-profile privacy');

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is(public.change_connection('11111111-1111-4111-8111-111111111111','unblock',current_setting('test.block_id')::uuid)->>'state','none','unblocking does not restore friendship');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','send')->>'state','outgoing','new request creates a new relationship');
select throws_ok($$select public.change_connection('11111111-1111-4111-8111-111111111111','cancel',current_setting('test.edge_id')::uuid)$$,'P0001','connection_changed','old generation cannot cancel new request');
select set_config('test.new_edge',(public.get_connection('11111111-1111-4111-8111-111111111111')->>'id'),true);
select is(public.change_connection('11111111-1111-4111-8111-111111111111','cancel',current_setting('test.new_edge')::uuid)->>'state','none','sender can cancel own pending request');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','cancel',current_setting('test.new_edge')::uuid)->>'state','none','cancel retry is idempotent');
select throws_ok($$select public.list_connections('all')$$,'22023',null,'unknown list cannot broaden visibility');
select throws_ok($$select public.list_connections('friends',now(),null)$$,'22023',null,'partial cursor is rejected');

reset role;
insert into private.friend_request_limits values('22222222-2222-4222-8222-222222222222',now(),30)
on conflict(user_id) do update set requests=30,window_start=now();
set local role authenticated;
select throws_ok($$select public.change_connection('11111111-1111-4111-8111-111111111111','send')$$,'P0001','request_rate_limited','direct RPC cannot bypass request rate limit');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','block')->>'state','blocked','request rate limit never prevents blocking');
select throws_ok($$select public.change_connection('11111111-1111-4111-8111-111111111111','unblock',current_setting('test.block_id')::uuid)$$,'P0001','connection_changed','stale unblock cannot remove a newer block');
reset role;
update private.friend_request_limits set window_start=now()-interval '2 hours' where user_id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select is(public.change_connection('33333333-3333-4333-8333-333333333333','send')->>'state','outgoing','rate limit resets after an hour');

reset role;
update auth.users set banned_until=now()+interval '1 hour' where id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select is((select count(*) from public.blocks),0::bigint,'bans revoke private block reads');
select is((select count(*) from public.friendships),0::bigint,'bans revoke private relationship reads');
select throws_ok($$select public.change_connection('33333333-3333-4333-8333-333333333333','block')$$,'42501','account_unavailable','banned account cannot mutate');
reset role;
update auth.users set banned_until=null where id='22222222-2222-4222-8222-222222222222';
delete from auth.sessions where user_id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select is((select count(*) from public.list_connections('outgoing')),0::bigint,'revoked JWT cannot list private relationships');
select throws_ok($$select public.get_connection('11111111-1111-4111-8111-111111111111')$$,'42501','account_unavailable','revoked session cannot inspect relationship state');
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
select throws_ok($$select public.change_connection('11111111-1111-4111-8111-111111111111','send')$$,'42501','account_unavailable','unverified caller cannot send');
reset role;
delete from auth.users where id='22222222-2222-4222-8222-222222222222';
select is((select count(*) from public.friendships where '22222222-2222-4222-8222-222222222222' in (user_low,user_high)),0::bigint,'account deletion cascades relationships');
select is((select count(*) from public.blocks where '22222222-2222-4222-8222-222222222222' in (blocker_id,blocked_id)),0::bigint,'account deletion cascades both block directions');
select is((select count(*) from private.friend_request_limits where user_id='22222222-2222-4222-8222-222222222222'),0::bigint,'account deletion removes its private request counter');
select * from finish();
rollback;
