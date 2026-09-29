begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, email, email_confirmed_at, is_anonymous)
values
  ('11111111-1111-4111-8111-111111111111', 'one@example.invalid', now(), false),
  ('22222222-2222-4222-8222-222222222222', 'two@example.invalid', now(), false),
  ('33333333-3333-4333-8333-333333333333', 'unverified@example.invalid', null, false);
insert into auth.sessions (id, user_id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles enforce RLS');
select ok(not has_table_privilege('anon', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE'), 'guests hold no write grants');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE,TRUNCATE'), 'users cannot delete accounts via profiles');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'), 'owner IDs are immutable to clients');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'INSERT'), 'creation timestamps are server owned');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE'), 'update timestamps are server owned');
select ok(not has_function_privilege('anon', 'public.save_profile(text,text,text)', 'EXECUTE'), 'guests cannot execute profile writes');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
select ok(public.account_is_active(), 'verified active account is accepted');
select lives_ok($$select public.save_profile('player_one', 'One 🎵', E'Hello\nMusic')$$, 'owner can create a profile');
select is((select username from public.profiles where id = auth.uid()), 'player_one', 'creation uses the authenticated owner');
select lives_ok($$select public.save_profile('player_one', 'Changed', '')$$, 'owner can update a profile');
select is((select display_name from public.profiles where id = auth.uid()), 'Changed', 'update was applied');
select throws_ok($$insert into public.profiles(id, username, display_name, bio) values ('22222222-2222-4222-8222-222222222222', 'forged_owner', 'Forged', '')$$,
  '42501', null, 'cannot create a profile for a different account');
select throws_ok($$update public.profiles set created_at = now()$$, '42501', null, 'cannot forge timestamps');
select throws_ok($$update public.profiles set id = '22222222-2222-4222-8222-222222222222'$$, '42501', null, 'cannot transfer profile ownership');
select throws_ok($$select public.save_profile('Bad_Name', 'Name', '')$$, '23514', null, 'direct RPC enforces canonical usernames');
select throws_ok($$select public.save_profile('player_one', repeat('x',41), '')$$, '23514', null, 'direct RPC limits display names');
select throws_ok($$select public.save_profile('player_one', 'Name', repeat('x',281))$$, '23514', null, 'direct RPC limits bios');
select throws_ok($$select public.save_profile('player_one', E'Name\tTab', '')$$, '23514', null, 'direct RPC rejects control characters');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select throws_ok($$select public.save_profile('player_one', 'Second', '')$$, '23505', null, 'usernames are unique');
select lives_ok($$select public.save_profile('player_two', 'Second', '')$$, 'second user can create their own profile');
with changed as (update public.profiles set bio = 'Cross-account write' where username = 'player_one' returning id)
select is((select count(*) from changed), 0::bigint, 'cross-account update touches no rows');
select is((select bio from public.profiles where username = 'player_one'), '', 'other profile remains intact');
select throws_ok($$delete from public.profiles where username = 'player_two'$$, '42501', null, 'raw profile deletion is not account deletion');

set local role anon;
select is((select count(*) from public.profiles), 2::bigint, 'guests can read public profiles');
select throws_ok($$select * from auth.users$$, '42501', null, 'guests cannot read private account records');
select throws_ok($$select public.save_profile('guest_name', 'Guest', '')$$, '42501', null, 'guests cannot call writes');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","session_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","user_metadata":{"email_verified":true}}', true);
select ok(not public.account_is_active(), 'editable metadata cannot impersonate email verification');
select throws_ok($$select public.save_profile('unverified', 'Unverified', '')$$, '42501', null, 'unverified account cannot create a profile');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select ok(not public.account_is_active(), 'another account session cannot authenticate this owner');

reset role;
update auth.users set banned_until = now() + interval '1 hour' where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
select ok(not public.account_is_active(), 'bans take effect for existing JWTs');
select throws_ok($$select public.save_profile('player_one', 'Banned change', '')$$, '42501', null, 'ban is enforced at the write');
reset role;
update auth.users set banned_until = null where id = '11111111-1111-4111-8111-111111111111';
update auth.sessions set not_after = now() - interval '1 second' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select ok(not public.account_is_active(), 'expired session cannot write');
reset role;
delete from auth.sessions where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select ok(not public.account_is_active(), 'revoked session is rejected even with an unexpired JWT');
select throws_ok($$select public.save_profile('player_one', 'Signed out change', '')$$, '42501', null, 'revoked session cannot write');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select ok(not public.account_is_active(), 'a user ID without a session ID is insufficient');
select throws_ok($$select * from auth.users$$, '42501', null, 'authenticated users cannot read private account records');
reset role;
update auth.users set deleted_at = now() where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select ok(not public.account_is_active(), 'soft-deleted accounts are inactive');
reset role;
update auth.users set deleted_at = null, is_anonymous = true where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
select ok(not public.account_is_active(), 'anonymous accounts cannot impersonate verified accounts');
reset role;
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';
select is((select count(*) from public.profiles where username = 'player_two'), 0::bigint, 'hard account deletion cascades the profile');

select * from finish();
rollback;
