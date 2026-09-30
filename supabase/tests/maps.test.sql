begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('11111111-1111-4111-8111-111111111111','map-one@example.invalid',now(),false),
('22222222-2222-4222-8222-222222222222','map-two@example.invalid',now(),false),
('33333333-3333-4333-8333-333333333333','map-reviewer@example.invalid',now(),false);
insert into auth.sessions(id,user_id) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333');
insert into public.profiles(id,username,display_name,bio) values
('11111111-1111-4111-8111-111111111111','map_one','One',''),
('22222222-2222-4222-8222-222222222222','map_two','Two',''),
('33333333-3333-4333-8333-333333333333','map_reviewer','Reviewer','');
insert into private.moderators(user_id) values('33333333-3333-4333-8333-333333333333');
select set_config('test.map_metadata','{"setId":"original-set","title":"Signal","artist":"Original artist","author":"Mapper","difficulties":[{"id":"intro","name":"Intro","author":"Mapper","notes":10,"lanes":2,"durationMs":10000}]}',true);
select ok(not has_table_privilege('authenticated','private.map_entries','SELECT,INSERT,UPDATE,DELETE'),'clients cannot forge or inspect raw publication rows');
select ok(not has_table_privilege('anon','private.map_uploads','SELECT,INSERT,UPDATE,DELETE'),'guests cannot inspect upload sessions');
select ok(not has_function_privilege('authenticated','public.complete_map_upload(uuid,uuid,text,text,jsonb,text,integer)','EXECUTE'),'a valid user JWT cannot assert server validation');
select ok(not has_function_privilege('authenticated','private.session_is_active(uuid,text)','EXECUTE'),'new shared session helper does not expose arbitrary sessions');
select ok(has_function_privilege('service_role','public.complete_map_upload(uuid,uuid,text,text,jsonb,text,integer)','EXECUTE'),'only the narrow service boundary can finalize');
set local role anon;
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.begin_map_upload(gen_random_uuid(),repeat('a',64))$$,'42501',null,'guest cannot reserve an upload');
select is((select count(*) from public.list_published_maps()),0::bigint,'empty catalog is real');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select is(public.begin_map_upload('10000000-0000-4000-8000-000000000001',repeat('a',64))->>'id','10000000-0000-4000-8000-000000000001','verified owner reserves an upload');
select is(public.begin_map_upload('10000000-0000-4000-8000-000000000009',repeat('a',64))->>'id','10000000-0000-4000-8000-000000000001','same revision retry reuses the reservation');
select throws_ok($$select public.begin_map_upload('10000000-0000-4000-8000-000000000001',repeat('b',64))$$,'P0001','map_upload_conflict','request ID binds one revision');
select is(public.published_map(repeat('a',64)),null::jsonb,'reservation alone cannot publish');
select throws_ok($$select public.complete_map_upload('10000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),current_setting('test.map_metadata')::jsonb,repeat('1',64),1000)$$,'42501',null,'direct finalization is denied');
reset role;
set local role service_role;
select set_config('test.published',public.complete_map_upload('10000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),current_setting('test.map_metadata')::jsonb,repeat('1',64),1000)::text,true);
select is(current_setting('test.published')::jsonb->>'publisherId','11111111-1111-4111-8111-111111111111','published owner is established by the server');
select is(public.complete_map_upload('10000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),current_setting('test.map_metadata')::jsonb,repeat('9',64),9000)->>'archiveSha256',repeat('1',64),'retries cannot replace a published archive');
select throws_ok($$select public.complete_map_upload('10000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',repeat('a',64),current_setting('test.map_metadata')::jsonb,repeat('1',64),1000)$$,'42501','account_unavailable','server finalization rechecks the exact owner session');
reset role;
set local role anon;
select is(public.published_map(repeat('a',64))->>'title','Signal','published pack is public without an account');
select is((select count(*) from public.list_published_maps('sIgNaL')),1::bigint,'search is case insensitive');
select is((select count(*) from public.list_published_maps('%')),0::bigint,'search treats SQL wildcard input literally');
select ok(not(public.published_map(repeat('a',64)) ?| array['session','email','token','objectKey','ranked','rating']),'public metadata has no secrets or invented rank');
select throws_ok($$select * from public.list_published_maps('',now(),null)$$,'22023','invalid_map','cursor fields must be paired');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select throws_ok($$select public.begin_map_upload(gen_random_uuid(),repeat('a',64))$$,'P0001','map_owner_conflict','another publisher cannot take a revision');
select throws_ok($$select public.set_map_visibility(repeat('a',64),(current_setting('test.published')::jsonb->>'version')::uuid,false)$$,'P0001','map_unavailable','another publisher cannot withdraw a map');
select is((select count(*) from public.own_published_maps()),0::bigint,'own list cannot leak another publisher hidden entries');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select set_config('test.hidden',public.set_map_visibility(repeat('a',64),(current_setting('test.published')::jsonb->>'version')::uuid,false)::text,true);
select is(public.published_map(repeat('a',64)),null::jsonb,'withdrawal removes public lookup and download authorization');
select is((select count(*) from public.own_published_maps()),1::bigint,'owner still has the withdrawn map');
select is(public.set_map_visibility(repeat('a',64),(current_setting('test.published')::jsonb->>'version')::uuid,false),current_setting('test.hidden')::jsonb,'lost-response withdrawal retry is idempotent');
select throws_ok($$select public.set_map_visibility(repeat('a',64),(current_setting('test.published')::jsonb->>'version')::uuid,true)$$,'P0001','map_changed','stale restore cannot undo a newer change');
select set_config('test.restored',public.set_map_visibility(repeat('a',64),(current_setting('test.hidden')::jsonb->>'version')::uuid,true)::text,true);
select is(public.published_map(repeat('a',64))->>'revision',repeat('a',64),'restoring keeps the immutable revision');
select throws_ok($$select public.review_map_visibility(repeat('a',64),(current_setting('test.restored')::jsonb->>'version')::uuid,gen_random_uuid(),true,'Test')$$,'42501','moderator_required','ordinary metadata cannot grant moderation');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
select set_config('test.moderated',public.review_map_visibility(repeat('a',64),(current_setting('test.restored')::jsonb->>'version')::uuid,'20000000-0000-4000-8000-000000000001',true,'Test removal')::text,true);
select is(public.published_map(repeat('a',64)),null::jsonb,'staff removal stops public distribution');
select is(public.review_map_visibility(repeat('a',64),(current_setting('test.restored')::jsonb->>'version')::uuid,'20000000-0000-4000-8000-000000000001',true,'Test removal'),current_setting('test.moderated')::jsonb,'staff action retry has one receipt');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select throws_ok($$select public.set_map_visibility(repeat('a',64),(current_setting('test.moderated')::jsonb->>'version')::uuid,true)$$,'42501','map_restricted','owner cannot bypass staff removal');
select is(public.begin_map_upload(gen_random_uuid(),repeat('a',64))->'entry'->>'moderated','true','republication does not bypass staff removal');
select lives_ok($$select public.begin_map_upload('10000000-0000-4000-8000-000000000002',repeat('b',64))$$,'owner can author a separate new revision');
reset role;
set local role service_role;
select set_config('test.second',public.complete_map_upload('10000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('b',64),current_setting('test.map_metadata')::jsonb,repeat('2',64),1200)::text,true);
select is(current_setting('test.second')::jsonb->>'onlineSetId',current_setting('test.published')::jsonb->>'onlineSetId','all owner revisions retain one map-set identity');
reset role;
update auth.users set banned_until=now()+interval '1 day' where id='11111111-1111-4111-8111-111111111111';
set local role anon;
select is(public.published_map(repeat('b',64)),null::jsonb,'banned publisher packs stop being public');
reset role;
update auth.users set banned_until=null where id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select lives_ok($$select public.begin_map_upload('10000000-0000-4000-8000-000000000003',repeat('c',64))$$,'reserve before session revocation');
reset role;
delete from auth.sessions where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role service_role;
select throws_ok($$select public.complete_map_upload('10000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('c',64),current_setting('test.map_metadata')::jsonb,repeat('3',64),1000)$$,'42501','account_unavailable','sign-out during upload prevents publication');
reset role;
delete from auth.users where id='11111111-1111-4111-8111-111111111111';
select is((select count(*) from private.map_entries),0::bigint,'account deletion removes publication metadata and access');
select is((select count(*) from private.map_sets),0::bigint,'account deletion removes map-set ownership');
select is((select count(*) from private.map_uploads),0::bigint,'account deletion removes reservations');
select is((select count(*) from private.map_reviews),0::bigint,'deleted map review records follow current map lifecycle');
select * from finish();
rollback;
