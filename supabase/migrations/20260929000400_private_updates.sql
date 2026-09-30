begin;
-- Private channel admission. Postgres Changes additionally authorizes every
-- account_updates row through its live-session RLS, even on an existing socket.
create policy notsu_account_channel on realtime.messages for select to authenticated
using ((select private.account_is_active()) and realtime.topic()='account:'||(select auth.uid())::text);
commit;
