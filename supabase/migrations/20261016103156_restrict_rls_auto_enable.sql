-- Security Advisor: public.rls_auto_enable() is the helper Supabase installs
-- for the "automatic RLS" project setting. It is an event-trigger function
-- (it runs after CREATE TABLE and enables RLS on new public tables), so no API
-- role ever needs to call it. Because it sits in `public`, anon and
-- authenticated could otherwise call it through the Data API.
--
-- Revoke EXECUTE from the API roles. Event triggers do not check the EXECUTE
-- privilege when they fire, so automatic RLS keeps working (tested locally
-- with a simulated helper; see DECISIONS.md D42).
--
-- Guarded: the function only exists on projects with the setting turned on
-- (the hosted project), not in local development.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
