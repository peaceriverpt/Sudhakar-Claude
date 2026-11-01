-- Public, token-based entry points (API keys, intake links) must find their organization before the
-- tenant context can be set. These SECURITY DEFINER functions return only the minimum needed for that.
create or replace function lookup_api_key(p_hash text)
returns table (id uuid, org_id uuid, name text, scopes text[])
language sql security definer stable set search_path = public as $$
  select k.id, k.org_id, k.name, k.scopes from api_keys k where k.key_hash = p_hash and k.revoked_at is null
$$;
create or replace function lookup_intake_token(p_hash text)
returns table (id uuid, org_id uuid)
language sql security definer stable set search_path = public as $$
  select s.id, s.org_id from intake_submissions s where s.token_hash = p_hash
$$;
create or replace function touch_api_key(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update api_keys set last_used_at = now() where id = p_id
$$;
revoke all on function lookup_api_key(text), lookup_intake_token(text), touch_api_key(uuid) from public;
grant execute on function lookup_api_key(text), lookup_intake_token(text), touch_api_key(uuid) to clinicflow_app;
