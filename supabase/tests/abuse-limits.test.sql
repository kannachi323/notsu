begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
('41111111-1111-4111-8111-111111111111','limit-one@example.invalid',now(),false),
('42222222-2222-4222-8222-222222222222','limit-full@example.invalid',now(),false),
('43333333-3333-4333-8333-333333333333','limit-restricted@example.invalid',now(),false),
('44444444-4444-4444-8444-444444444444','limit-mod-a@example.invalid',now(),false),
('45555555-5555-4555-8555-555555555555','limit-mod-b@example.invalid',now(),false);
insert into auth.sessions(id,user_id) values
('a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','41111111-1111-4111-8111-111111111111'),
('a2222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','42222222-2222-4222-8222-222222222222'),
('a3333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','43333333-3333-4333-8333-333333333333'),
('a4444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444');
insert into public.profiles(id,username,display_name,bio) values
('41111111-1111-4111-8111-111111111111','limit_one','One',''),
('42222222-2222-4222-8222-222222222222','limit_full','Full',''),
('43333333-3333-4333-8333-333333333333','limit_restricted','Restricted',''),
('44444444-4444-4444-8444-444444444444','limit_mod_a','Mod A',''),
('45555555-5555-4555-8555-555555555555','limit_mod_b','Mod B','');
insert into private.moderators(user_id) values('44444444-4444-4444-8444-444444444444'),('45555555-5555-4555-8555-555555555555');

-- A full library: 16 maximum-size revisions reach the 256 MB quota.
with created as (insert into private.map_sets(owner_id,local_id) values('42222222-2222-4222-8222-222222222222','full') returning id)
insert into private.map_entries(revision,set_id,owner_id,metadata,archive_sha256,bytes)
select lpad(to_hex(n),64,'0'),created.id,'42222222-2222-4222-8222-222222222222','{}'::jsonb,repeat('1',64),16777216
from created,generate_series(1,16) n;
-- One published map owned by moderator B.
with created as (insert into private.map_sets(owner_id,local_id) values('45555555-5555-4555-8555-555555555555','mod') returning id)
insert into private.map_entries(revision,set_id,owner_id,metadata,archive_sha256,bytes)
select repeat('e',64),created.id,'45555555-5555-4555-8555-555555555555','{}'::jsonb,repeat('2',64),1000 from created;
insert into private.community_restrictions(user_id,expires_at,note) values('43333333-3333-4333-8333-333333333333',now()+interval '7 days','test');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"41111111-1111-4111-8111-111111111111","session_id":"a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select ok(public.begin_map_upload('51111111-0000-4000-8000-000000000001',repeat('c',64)) ? 'mediaId','first write of a reservation is allowed');
select ok(public.begin_map_upload('51111111-0000-4000-8000-000000000001',repeat('c',64)) ? 'mediaId','a reservation tolerates a few network retries');
select public.begin_map_upload('51111111-0000-4000-8000-000000000001',repeat('c',64));
select public.begin_map_upload('51111111-0000-4000-8000-000000000001',repeat('c',64));
select public.begin_map_upload('51111111-0000-4000-8000-000000000001',repeat('c',64));
select throws_ok($$select public.begin_map_upload('51111111-0000-4000-8000-000000000001',repeat('c',64))$$,'P0001','map_upload_attempts','a reservation cannot keep writing new media objects');
select throws_ok($$select public.begin_map_upload('51111111-0000-4000-8000-000000000001',repeat('c',64))$$,'P0001','map_upload_attempts','the limit holds after a refused attempt');

select set_config('request.jwt.claims','{"sub":"42222222-2222-4222-8222-222222222222","session_id":"a2222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select throws_ok($$select public.begin_map_upload('52222222-0000-4000-8000-000000000001',repeat('d',64))$$,'P0001','map_quota','a full library is refused before any upload body is stored');

select set_config('request.jwt.claims','{"sub":"43333333-3333-4333-8333-333333333333","session_id":"a3333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select throws_ok($$select public.change_connection('41111111-1111-4111-8111-111111111111','send')$$,'P0001','connection_unavailable','a restricted player cannot send friend requests');

select set_config('request.jwt.claims','{"sub":"41111111-1111-4111-8111-111111111111","session_id":"a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select is(public.change_connection('42222222-2222-4222-8222-222222222222','send')->>'state','outgoing','an available player still sends requests through the wrapper');

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","session_id":"a4444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
select throws_ok($$select public.review_map_visibility(repeat('e',64),gen_random_uuid(),gen_random_uuid(),true,'hide')$$,'P0001','map_unavailable','a moderator cannot hide another moderator''s map');
reset role;

select ok(not has_function_privilege('authenticated','private.change_connection_checked(uuid,text,uuid)','EXECUTE'),'the unwrapped friend function is private');
select ok(not has_function_privilege('authenticated','private.review_map_visibility_checked(text,uuid,uuid,boolean,text)','EXECUTE'),'the unwrapped map review function is private');
select * from finish();
rollback;
