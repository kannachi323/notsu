begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('11111111-1111-4111-8111-111111111111','reporter@example.invalid',now(),false),
('22222222-2222-4222-8222-222222222222','reported@example.invalid',now(),false),
('33333333-3333-4333-8333-333333333333','outsider@example.invalid',now(),false),
('44444444-4444-4444-8444-444444444444','reviewer@example.invalid',now(),false);
insert into auth.sessions(id,user_id) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222'),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444');
insert into public.profiles(id,username,display_name,bio) values
('11111111-1111-4111-8111-111111111111','report_one','Reporter',''),
('22222222-2222-4222-8222-222222222222','report_two','Reported player','Original bio'),
('33333333-3333-4333-8333-333333333333','report_three','Outsider',''),
('44444444-4444-4444-8444-444444444444','report_four','Reviewer','');
insert into private.moderators(user_id) values('44444444-4444-4444-8444-444444444444');
insert into public.friendships(user_low,user_high,requested_by,accepted_at) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',now());
insert into public.direct_messages(sender_id,recipient_id,id,sequence,body) values
('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',1,'Server-owned evidence 🎵');
select ok(not has_table_privilege('authenticated','private.reports','SELECT,INSERT,UPDATE,DELETE'),'raw reports are private');
select ok(not has_table_privilege('authenticated','private.moderators','SELECT,INSERT,UPDATE,DELETE'),'clients cannot grant moderator roles');
select ok(not has_function_privilege('authenticated','private.report_context(uuid,uuid,uuid)','EXECUTE'),'cannot choose reporter identity');
select ok(not has_function_privilege('authenticated','private.purge_reports()','EXECUTE'),'clients cannot destroy evidence');
select ok(not has_function_privilege('anon','public.moderation_report(uuid)','EXECUTE'),'guests cannot inspect reviews');
select ok(not has_function_privilege('authenticated','private.renew_presence(uuid,integer,boolean)','EXECUTE'),'presence implementation cannot bypass restriction wrapper');
select is((select array_agg(tablename::text) from pg_publication_tables where pubname='supabase_realtime'),array['account_updates'],'reports and actions are not replicated');
select is((select count(*) from cron.job where jobname='notsu-report-retention' and active),1::bigint,'retention maintenance is scheduled once');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select is((public.moderation_access()->>'moderator')::boolean,false,'ordinary account has no review role');
select throws_ok($$select public.moderation_queue('open')$$,'42501','moderator_required','ordinary user cannot list queue');
select throws_ok($$select public.report_context('11111111-1111-4111-8111-111111111111')$$,'22023','invalid_report','cannot report own profile');
select throws_ok($$select public.submit_report(gen_random_uuid(),'22222222-2222-4222-8222-222222222222',null,'other',repeat('x',2001),false)$$,'22023','invalid_report','details are bounded');
select is(public.report_context('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->'message'->>'body','Server-owned evidence 🎵','recipient can inspect exact received evidence');
select set_config('test.receipt',public.submit_report('10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','harassment','Local test concern',true)::text,true);
select is(current_setting('test.receipt')::jsonb->>'status','open','report begins awaiting human review');
select ok(not (current_setting('test.receipt')::jsonb ?| array['evidence','reporterId','decisionNote','targetId']),'receipt omits private evidence and review details');
select is(public.get_connection('22222222-2222-4222-8222-222222222222')->>'state','blocked','report and optional block commit together');
select is(public.report_context('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->'message'->>'body','Server-owned evidence 🎵','exact received evidence remains reportable after block');
select throws_ok($$select public.list_messages('22222222-2222-4222-8222-222222222222')$$,'P0001','conversation_unavailable','report endpoint does not restore chat access');
select is(public.submit_report('10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','harassment','Local test concern',true),current_setting('test.receipt')::jsonb,'identical retry returns one receipt');
select throws_ok($$select public.submit_report('10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',null,'other','changed',false)$$,'P0001','report_conflict','request ID cannot change evidence');
select is((select count(*) from public.list_own_reports()),1::bigint,'reporter sees own receipt only');
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',true);
select throws_ok($$select public.report_context('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')$$,'P0001','report_unavailable','outsider cannot retrieve private message evidence');
select is((select count(*) from public.list_own_reports()),0::bigint,'outsider cannot list reports about others');
reset role;
update auth.users set raw_user_meta_data='{"moderator":true,"role":"admin"}' where id='33333333-3333-4333-8333-333333333333';
set local role authenticated;
select is((public.moderation_access()->>'moderator')::boolean,false,'editable metadata cannot grant review rights');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is((select count(*) from public.list_own_reports()),0::bigint,'reported player cannot discover reports about them');
select throws_ok($$select public.moderation_report('10000000-0000-4000-8000-000000000001')$$,'42501','moderator_required','reported player cannot inspect reporter identity');
reset role;
update private.report_limits set requests=10 where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select throws_ok($$select public.submit_report(gen_random_uuid(),'22222222-2222-4222-8222-222222222222',null,'other','new concern',false)$$,'P0001','report_rate_limited','direct RPC enforces report quota');
select lives_ok($$select public.submit_report('10000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','harassment','Local test concern',true)$$,'quota does not block idempotent retry');
reset role;
delete from private.report_limits where user_id='11111111-1111-4111-8111-111111111111';
delete from public.blocks where blocker_id='11111111-1111-4111-8111-111111111111';
insert into public.friendships(user_low,user_high,requested_by,accepted_at) values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',now());
set local role authenticated;
select lives_ok($$select public.submit_report('10000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',null,'other','Profile concern',false)$$,'profile evidence captured separately');
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
select is((public.moderation_access()->>'moderator')::boolean,true,'provisioned reviewer has access');
select set_config('test.review',public.moderation_report('10000000-0000-4000-8000-000000000001')::text,true);
select is(current_setting('test.review')::jsonb->'evidence'->'message'->>'body','Server-owned evidence 🎵','reviewer sees original server-captured evidence');
select set_config('test.decision',public.review_report('10000000-0000-4000-8000-000000000001',(current_setting('test.review')::jsonb->>'revision')::uuid,'20000000-0000-4000-8000-000000000001','restrict_7d','Community guideline review: local test')::text,true);
select is(current_setting('test.decision')::jsonb->>'status','action_taken','restriction and review close atomically');
select is(jsonb_array_length(current_setting('test.decision')::jsonb->'actions'),1,'one decision has one audit row');
select is(public.review_report('10000000-0000-4000-8000-000000000001',(current_setting('test.review')::jsonb->>'revision')::uuid,'20000000-0000-4000-8000-000000000001','restrict_7d','Community guideline review: local test'),current_setting('test.decision')::jsonb,'lost decision response retries without duplicating');
select throws_ok($$select public.review_report('10000000-0000-4000-8000-000000000001',(current_setting('test.review')::jsonb->>'revision')::uuid,gen_random_uuid(),'dismiss','stale decision')$$,'P0001','report_changed','stale concurrent decision is refused');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select ok(public.account_is_active(),'restriction preserves authenticated account controls');
select is(public.moderation_access()->'restriction'->>'note','Community guideline review: local test','player sees only the moderation explanation');
select is((select count(*) from public.profiles where id=auth.uid()),1::bigint,'restricted player can read own profile');
select throws_ok($$select public.save_profile('new_report_two','Changed','')$$,'42501',null,'restricted profile writes fail even through direct RPC');
select throws_ok($$select public.send_message('11111111-1111-4111-8111-111111111111',gen_random_uuid(),'blocked by restriction')$$,'P0001','conversation_unavailable','restriction prevents messages with an otherwise accepted friend');
select is((select count(*) from public.friendships),0::bigint,'restricted actor cannot read friend graph');
select is((public.renew_presence(gen_random_uuid(),1,true)->>'validForMs')::integer,0,'restricted presence never acknowledges an online lease');
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
select is((select count(*) from public.profiles where id='22222222-2222-4222-8222-222222222222'),0::bigint,'restriction hides public profile through direct reads');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
select lives_ok($$select public.review_report('10000000-0000-4000-8000-000000000001',(current_setting('test.decision')::jsonb->>'revision')::uuid,'20000000-0000-4000-8000-000000000002','lift_restriction','Review corrected')$$,'reviewer can lift the exact recorded restriction');
select is(jsonb_array_length(public.moderation_report('10000000-0000-4000-8000-000000000001')->'actions'),2,'lifting appends audit history');
reset role;
update public.profiles set bio='Newer profile text' where id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select throws_ok($$select public.review_report('10000000-0000-4000-8000-000000000002',(public.moderation_report('10000000-0000-4000-8000-000000000002')->>'revision')::uuid,gen_random_uuid(),'clear_profile','Profile content removal')$$,'P0001','profile_changed','old evidence cannot clear newly edited profile');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select lives_ok($$select public.submit_report('10000000-0000-4000-8000-000000000003','22222222-2222-4222-8222-222222222222',null,'other','Current profile concern',false)$$,'new evidence can be reported');
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
select lives_ok($$select public.review_report('10000000-0000-4000-8000-000000000003',(public.moderation_report('10000000-0000-4000-8000-000000000003')->>'revision')::uuid,gen_random_uuid(),'clear_profile','Profile content removal')$$,'current profile can be cleared');
select is((select bio from public.profiles where id='22222222-2222-4222-8222-222222222222'),'','profile bio was cleared');
select ok((select username like 'player_%' from public.profiles where id='22222222-2222-4222-8222-222222222222'),'profile reset replaces offending username');
select lives_ok($$select public.submit_report('10000000-0000-4000-8000-000000000004','22222222-2222-4222-8222-222222222222',null,'other','Reviewer submitted concern',false)$$,'reviewers can submit ordinary reports');
select throws_ok($$select public.moderation_report('10000000-0000-4000-8000-000000000004')$$,'P0001','report_unavailable','reviewer cannot handle own report');
reset role;
insert into private.moderators(user_id) values('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select throws_ok($$select public.review_report('10000000-0000-4000-8000-000000000002',(public.moderation_report('10000000-0000-4000-8000-000000000002')->>'revision')::uuid,gen_random_uuid(),'restrict_7d','Staff account needs operator review')$$,'P0001','protected_target','reviewer cannot restrict another moderator');
reset role;
delete from private.moderators where user_id='22222222-2222-4222-8222-222222222222';
insert into private.community_restrictions values('22222222-2222-4222-8222-222222222222','10000000-0000-4000-8000-000000000003',now()-interval '1 second','Expired synthetic restriction');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
select is(public.moderation_access()->'restriction','null'::jsonb,'expired restriction does not need a cleanup job to restore access');
select is((select count(*) from public.friendships),1::bigint,'existing friendship is visible again after natural expiry');
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
select is((select count(*) from public.profiles where id='22222222-2222-4222-8222-222222222222'),1::bigint,'naturally expired restriction restores public visibility');
reset role;
insert into private.reports(id,reporter_id,target_id,request_hash,reason,details,evidence,created_at)
select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,reporter_id,target_id,'paging fixture','other','Synthetic queue fixture',evidence,now()+interval '1 day'
from private.reports cross join generate_series(1,53) n where id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
select is((select count(*) from public.moderation_queue('open')),51::bigint,'queue RPC is bounded including its pagination sentinel');
select set_config('test.cursor',(select row::text from public.moderation_queue('open') row offset 49 limit 1),true);
select is(current_setting('test.cursor')::jsonb->>'id','50000000-0000-4000-8000-000000000004','equal timestamps sort by descending report UUID');
select is((select count(*) from public.moderation_queue('open',(current_setting('test.cursor')::jsonb->>'createdAt')::timestamptz,(current_setting('test.cursor')::jsonb->>'id')::uuid) row where row->>'id' like '50000000-%'),3::bigint,'next page contains exactly the remaining tied report rows');
select ok(not exists(select 1 from public.moderation_queue('open',(current_setting('test.cursor')::jsonb->>'createdAt')::timestamptz,(current_setting('test.cursor')::jsonb->>'id')::uuid) row where row->>'id'='10000000-0000-4000-8000-000000000004'),'pagination still excludes reviewer-authored reports');
reset role;
delete from private.reports where id::text like '50000000-%';
delete from private.moderators where user_id='44444444-4444-4444-8444-444444444444';
set local role authenticated;
select throws_ok($$select public.moderation_report('10000000-0000-4000-8000-000000000001')$$,'42501','moderator_required','role revocation affects an existing JWT immediately');
reset role;
delete from auth.users where id in('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
select is((select count(*) from public.direct_messages where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),0::bigint,'account deletion removes conversation history');
select is((select evidence->'message'->>'body' from private.reports where id='10000000-0000-4000-8000-000000000001'),'Server-owned evidence 🎵','reported evidence follows disclosed retention');
select ok((select reporter_id is null and target_id is null from private.reports where id='10000000-0000-4000-8000-000000000001'),'deleted account identity references are cleared');
update private.reports set reviewed_at=now()-interval '91 days' where id='10000000-0000-4000-8000-000000000001';
update private.reports set created_at=now()-interval '181 days' where id='10000000-0000-4000-8000-000000000002';
select lives_ok($$select private.purge_reports()$$,'trusted retention maintenance runs');
select is((select count(*) from private.reports where id in('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')),0::bigint,'expired reviewed and unreviewed evidence is purged');
select is((select count(*) from private.moderation_actions where report_id='10000000-0000-4000-8000-000000000001'),0::bigint,'audit content expires with its report');
select is((select count(*) from private.reports where id='10000000-0000-4000-8000-000000000003'),1::bigint,'recent reviewed evidence is retained');
select * from finish();
rollback;
