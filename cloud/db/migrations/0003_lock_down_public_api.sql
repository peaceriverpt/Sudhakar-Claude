-- Some hosts (Supabase) expose the public schema through an automatic web API using the roles
-- "anon" and "authenticated". ClinicFlow never uses that API, so make sure those roles can touch
-- none of its tables, functions or sequences, now or in future migrations.
do $$
declare r text; t record;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'S') and pg_get_userbyid(c.relowner) = current_user loop
        execute format('revoke all on %I from %I', t.relname, r);
      end loop;
      execute format('revoke all on function lookup_api_key(text), lookup_intake_token(text), touch_api_key(uuid), current_org_id() from %I', r);
      execute format('alter default privileges for role %I in schema public revoke all on tables from %I', current_user, r);
      execute format('alter default privileges for role %I in schema public revoke all on functions from %I', current_user, r);
    end if;
  end loop;
end $$;
