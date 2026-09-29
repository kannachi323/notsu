begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('11111111-1111-4111-8111-111111111111','presence-a@example.invalid',now(),false),
('22222222-2222-4222-8222-222222222222','presence-b@example.invalid',now(),false),
('33333333-3333-4333-8333-333333333333','presence-c@example.invalid',now(),false);
insert into auth.sessions(id,user_id) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','11111111-1111-4111-8111-111111111111'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333');
insert into public.profiles(id,username,display_name) values
('11111111-1111-4111-8111-111111111111','presence_one','One'),
('22222222-2222-4222-8222-222222222222','presence_two','Two'),
('33333333-3333-4333-8333-333333333333','presence_three','Three');
insert into public.friendships(user_low,user_high,requested_by,accepted_at) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',now());
select ok(not has_table_privilege('authenticated','private.presence_leases','SELECT,INSERT,UPDATE,DELETE'),'clients cannot inspect device/session leases');
select ok(not has_table_privilege('authenticated','private.presence_settings','SELECT,INSERT,UPDATE,DELETE'),'visibility settings are private');
select ok(not has_function_privilege('authenticated','private.presence_until(uuid)','EXECUTE'),'no arbitrary last-seen lookup');
select ok(not has_function_privilege('anon','public.friend_presence(uuid[])','EXECUTE'),'guests have no presence access');
select is((select array_agg(tablename::text) from pg_publication_tables where pubname='supabase_realtime'),array['account_updates'],'presence records are not replicated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select is(public.get_presence_settings()->>'visibility','hidden','new account is hidden');
select is((public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,true)->>'validForMs')::integer,0,'hidden heartbeat never exposes online state');
select is(public.set_presence_visibility('friends')->>'visibility','friends','owner opts in');
select ok((public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',2,true)->>'validForMs')::integer between 80000 and 90000,'server bounds the lease');
select set_config('test.signal',(select revision::text from public.account_updates),true);
select lives_ok($$select public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',3,true)$$,'renewal succeeds');
select is((select revision::text from public.account_updates),current_setting('test.signal'),'routine renewal does not fan out notifications');
select lives_ok($$select public.set_presence_visibility('friends')$$,'idempotent visibility retry');
select is((select revision::text from public.account_updates),current_setting('test.signal'),'unchanged visibility does not fan out');
select throws_ok($$select public.renew_presence(gen_random_uuid(),0,true)$$,'22023','invalid_presence','invalid sequence denied');
select throws_ok($$select public.friend_presence(array_fill(gen_random_uuid(),array[51]))$$,'22023','invalid_presence','presence lookups are bounded');
select throws_ok($$select public.friend_presence(array[null::uuid])$$,'22023','invalid_presence','null target denied');

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select ok((select online from public.friend_presence(array['11111111-1111-4111-8111-111111111111'::uuid])),'accepted friend sees online');
select is((select valid_for_ms%5000 from public.friend_presence(array['11111111-1111-4111-8111-111111111111'::uuid])),0,'lifetime is rounded, not a timestamp');
select is((select online from public.friend_presence(array['33333333-3333-4333-8333-333333333333'::uuid])),false,'nonfriend is uniformly offline');
select is((select online from public.friend_presence(array['99999999-9999-4999-8999-999999999999'::uuid])),false,'unknown player is uniformly offline');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
select is((select online from public.friend_presence(array['11111111-1111-4111-8111-111111111111'::uuid])),false,'outsider cannot discover online state');

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select is((public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',5,false)->>'validForMs')::integer,0,'release ends this window');
select is((public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',4,true)->>'validForMs')::integer,0,'delayed old heartbeat cannot undo release');
select lives_ok($$select public.renew_presence('dddddddd-dddd-4ddd-8ddd-ddddddddddd2',2,false)$$,'release before first heartbeat leaves a tombstone');
select is((public.renew_presence('dddddddd-dddd-4ddd-8ddd-ddddddddddd2',1,true)->>'validForMs')::integer,0,'late first heartbeat cannot resurrect a closed window');
select ok((public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',6,true)->>'validForMs')::integer>0,'newer visible transition succeeds');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","role":"authenticated"}',true);
select ok((public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,true)->>'validForMs')::integer>0,'same client ID in another session is independent');
reset role;
delete from auth.sessions where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select ok((select online from public.friend_presence(array['11111111-1111-4111-8111-111111111111'::uuid])),'another active session keeps the account online');
reset role;
update auth.sessions set not_after=clock_timestamp()+interval '10 seconds' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
set local role authenticated;
select ok((select valid_for_ms from public.friend_presence(array['11111111-1111-4111-8111-111111111111'::uuid])) between 1 and 10000,'friend lifetime cannot exceed Auth session expiry');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","role":"authenticated"}',true);
select ok((public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,true)->>'validForMs')::integer between 1 and 10000,'own acknowledgement respects Auth session expiry');
reset role;
update auth.sessions set not_after=null where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
update private.presence_leases set expires_at=now()-interval '1 second' where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is((select online from public.friend_presence(array['11111111-1111-4111-8111-111111111111'::uuid])),false,'expired lease goes offline without cron cleanup');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","role":"authenticated"}',true);
select lives_ok($$select public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',2,true)$$,'lease recovers after expiry');
select is(public.set_presence_visibility('hidden')->>'visibility','hidden','hiding applies to every client');
select is((public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',3,true)->>'validForMs')::integer,0,'old client cannot override hidden preference');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is((select online from public.friend_presence(array['11111111-1111-4111-8111-111111111111'::uuid])),false,'hidden and offline look identical');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','block')->>'state','blocked','block applies');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","role":"authenticated"}',true);
select lives_ok($$select public.set_presence_visibility('friends'); select public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',4,true)$$,'owner is online for permitted viewers');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is((select online from public.friend_presence(array['11111111-1111-4111-8111-111111111111'::uuid])),false,'blocker cannot inspect blocked presence');

reset role;
insert into private.presence_limits values('11111111-1111-4111-8111-111111111111',now(),60) on conflict(user_id) do update set requests=60,window_start=now();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2","role":"authenticated"}',true);
select throws_ok($$select public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',5,true)$$,'P0001','presence_rate_limited','direct RPC respects quota');
select lives_ok($$select public.renew_presence('dddddddd-dddd-4ddd-8ddd-dddddddddddd',5,false)$$,'quota never prevents release');
select lives_ok($$select public.set_presence_visibility('hidden')$$,'quota never prevents hiding');
reset role;
delete from private.presence_limits where user_id='11111111-1111-4111-8111-111111111111';
delete from private.presence_leases where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select lives_ok($$select public.set_presence_visibility('friends'); select public.renew_presence(gen_random_uuid(),1,true) from generate_series(1,10)$$,'up to ten recent windows are allowed');
select throws_ok($$select public.renew_presence(gen_random_uuid(),1,true)$$,'P0001','presence_window_limit','window identifiers cannot grow storage without bound');
reset role;
update private.presence_leases set expires_at=now()-interval '6 minutes',updated_at=now()-interval '6 minutes' where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select lives_ok($$select public.renew_presence(gen_random_uuid(),1,true)$$,'old tombstones can be reclaimed');
reset role;
delete from auth.sessions where user_id='11111111-1111-4111-8111-111111111111';
select is((select count(*) from private.presence_leases where user_id='11111111-1111-4111-8111-111111111111'),0::bigint,'session revocation cascades leases');
set local role authenticated;
select throws_ok($$select public.renew_presence(gen_random_uuid(),1,true)$$,'42501','account_unavailable','revoked JWT cannot renew');
select throws_ok($$select public.get_presence_settings()$$,'42501','account_unavailable','revoked JWT cannot read private preference');
reset role;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
select is((select count(*) from private.presence_settings where user_id='11111111-1111-4111-8111-111111111111'),0::bigint,'deletion removes preference');
select is((select count(*) from private.presence_limits where user_id='11111111-1111-4111-8111-111111111111'),0::bigint,'deletion removes quota record');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select lives_ok($$select public.set_presence_visibility('friends'); select public.renew_presence(gen_random_uuid(),1,true)$$,'prepare account deletion while actively online');
reset role;
select lives_ok($$delete from auth.users where id='22222222-2222-4222-8222-222222222222'$$,'deleting an online account does not recreate its notification record');
select is((select count(*) from private.presence_leases where user_id='22222222-2222-4222-8222-222222222222'),0::bigint,'active leases cascade on deletion');
select is((select count(*) from public.account_updates where user_id='22222222-2222-4222-8222-222222222222'),0::bigint,'deleted account has no notification record');
select * from finish();
rollback;
