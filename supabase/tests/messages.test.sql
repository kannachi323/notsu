begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('11111111-1111-4111-8111-111111111111','message-a@example.invalid',now(),false),
('22222222-2222-4222-8222-222222222222','message-b@example.invalid',now(),false),
('33333333-3333-4333-8333-333333333333','message-c@example.invalid',now(),false);
insert into auth.sessions(id,user_id) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333');
insert into public.profiles(id,username,display_name) values
('11111111-1111-4111-8111-111111111111','message_one','One'),
('22222222-2222-4222-8222-222222222222','message_two','Two'),
('33333333-3333-4333-8333-333333333333','message_three','Three');
insert into public.friendships(user_low,user_high,requested_by,accepted_at) values
('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',now());
select ok(not has_table_privilege('authenticated','public.direct_messages','INSERT,UPDATE,DELETE,TRUNCATE'),'no direct message mutations');
select ok(not has_table_privilege('anon','public.direct_messages','SELECT'),'no guest reads');
select ok(not has_table_privilege('authenticated','private.message_limits','SELECT,INSERT,UPDATE,DELETE'),'rate counters are private');
select ok(not has_table_privilege('authenticated','public.account_updates','INSERT,UPDATE,DELETE'),'no forged live hints');
select ok(not has_function_privilege('authenticated','private.signal_accounts(uuid,uuid)','EXECUTE'),'clients cannot signal another account');
select ok(not has_function_privilege('anon','public.send_message(uuid,uuid,text)','EXECUTE'),'no guest sends');
select is((select array_agg(tablename::text order by tablename) from pg_publication_tables where pubname='supabase_realtime'),array['account_updates'],'only sanitized updates are replicated');
select ok((select pubinsert and pubupdate and not pubdelete and not pubtruncate from pg_publication where pubname='supabase_realtime'),'no delete-event leaks');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select throws_ok($$select public.send_message('33333333-3333-4333-8333-333333333333',gen_random_uuid(),'hello')$$,'P0001','conversation_unavailable','nonfriends cannot message');
select throws_ok($$select public.send_message('22222222-2222-4222-8222-222222222222',gen_random_uuid(),'  ')$$,'22023','invalid_message','blank message denied');
select throws_ok($$select public.send_message('22222222-2222-4222-8222-222222222222',gen_random_uuid(),repeat('🎵',2001))$$,'22023','invalid_message','Unicode length bounded');
select throws_ok($$select public.send_message('22222222-2222-4222-8222-222222222222',gen_random_uuid(),chr(133))$$,'22023','invalid_message','C1 controls denied');
select is(public.send_message('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',E'Hello 🎵\n<script>text only</script>')->>'sequence','1','first sequence is scoped to pair');
select is(public.send_message('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',E'Hello 🎵\n<script>text only</script>')->>'sequence','1','same ID and content is idempotent');
select throws_ok($$select public.send_message('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','changed')$$,'P0001','message_conflict','IDs cannot silently replace content');
select is((select count(*) from public.direct_messages),1::bigint,'sender reads only own conversation');
select is((select count(*) from public.account_updates),1::bigint,'only own notification row is readable');
select is((select unread from public.list_conversations()),0,'own sent message is not unread');
select throws_ok($$select public.mark_messages_read('22222222-2222-4222-8222-222222222222',100)$$,'22023','invalid_message','cannot mark unsent future messages read');
select throws_ok($$select * from public.list_messages('22222222-2222-4222-8222-222222222222',0)$$,'22023','invalid_message','invalid cursor denied');

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is((select unread from public.list_conversations()),1,'recipient has one unread');
select lives_ok($$select public.mark_messages_read('11111111-1111-4111-8111-111111111111',1)$$,'recipient marks received history read');
select is((select unread from public.list_conversations()),0,'read position removes unread');
select set_config('test.revision',(select revision::text from public.account_updates),true);
select lives_ok($$select public.mark_messages_read('11111111-1111-4111-8111-111111111111',1)$$,'read retry succeeds');
select is((select revision::text from public.account_updates),current_setting('test.revision'),'read retry causes no realtime loop');
select is(public.send_message('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Hi!')->>'sequence','2','other sender can reuse ID without collision');
select is((select count(*) from public.list_messages('11111111-1111-4111-8111-111111111111')),2::bigint,'both messages are readable');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
select is((select count(*) from public.direct_messages),0::bigint,'outsider has no direct message visibility');
select is((select count(*) from public.message_reads),0::bigint,'read positions are private');
select is((select count(*) from public.account_updates),0::bigint,'outsider cannot read account signals');

reset role;
insert into public.direct_messages(sender_id,recipient_id,id,sequence,body)
select '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',gen_random_uuid(),n,'Message '||n from generate_series(3,57)n;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is((select count(*) from public.list_messages('11111111-1111-4111-8111-111111111111')),51::bigint,'history uses bounded lookahead');
select is((select count(*) from public.list_messages('11111111-1111-4111-8111-111111111111',8)),7::bigint,'earlier pages have no boundary overlap');
select lives_ok($$select public.mark_messages_read('11111111-1111-4111-8111-111111111111',57)$$,'read latest');
select lives_ok($$select public.mark_messages_read('11111111-1111-4111-8111-111111111111',1)$$,'old device read is harmless');
select is((select sequence from public.message_reads),57::bigint,'read position never goes backward');
select is(public.change_connection('11111111-1111-4111-8111-111111111111','block')->>'state','blocked','block applies to messaging');
select is((select count(*) from public.direct_messages),0::bigint,'blocker cannot read blocked conversation');
select is((select count(*) from public.list_conversations()),0::bigint,'blocked conversation absent from inbox');
select throws_ok($$select public.send_message('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'blocked')$$,'P0001','conversation_unavailable','blocker cannot send');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select is((select count(*) from public.direct_messages),0::bigint,'blocked recipient cannot read history');
select throws_ok($$select public.send_message('22222222-2222-4222-8222-222222222222',gen_random_uuid(),'blocked')$$,'P0001','conversation_unavailable','blocked sender denied');
reset role;
delete from public.blocks where blocker_id='22222222-2222-4222-8222-222222222222';
insert into public.friendships(user_low,user_high,requested_by,accepted_at) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',now());
insert into private.message_limits values('11111111-1111-4111-8111-111111111111',now(),30,now(),30) on conflict(user_id) do update set minute_count=30,minute_start=now();
set local role authenticated;
select throws_ok($$select public.send_message('22222222-2222-4222-8222-222222222222',gen_random_uuid(),'rate')$$,'P0001','message_rate_limited','direct RPC enforces minute limit');
select is(public.send_message('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',E'Hello 🎵\n<script>text only</script>')->>'sequence','1','idempotent retry does not consume quota');
reset role;
update private.message_limits set minute_start=now()-interval '2 minutes',day_count=1000 where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select throws_ok($$select public.send_message('22222222-2222-4222-8222-222222222222',gen_random_uuid(),'rate')$$,'P0001','message_rate_limited','daily limit enforced');
reset role;
delete from auth.sessions where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select is((select count(*) from public.direct_messages),0::bigint,'revoked session loses history');
select is((select count(*) from public.account_updates),0::bigint,'revoked session loses realtime hints');
select throws_ok($$select public.send_message('22222222-2222-4222-8222-222222222222',gen_random_uuid(),'revoked')$$,'42501','account_unavailable','revoked send denied');
reset role;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.direct_messages where '11111111-1111-4111-8111-111111111111' in(sender_id,recipient_id)),0::bigint,'deletion removes both sides of history');
select is((select count(*) from public.message_reads where '11111111-1111-4111-8111-111111111111' in(user_id,peer_id)),0::bigint,'deletion removes read positions');
select is((select count(*) from public.account_updates where user_id='11111111-1111-4111-8111-111111111111'),0::bigint,'deletion does not recreate notification row');
select * from finish();
rollback;
