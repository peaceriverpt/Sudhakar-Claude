-- ClinicFlow Cloud: initial schema
-- Multi-tenant: every clinic business is an "organization". Every tenant table carries org_id and is
-- protected by row-level security keyed on the per-transaction setting app.org_id.

create extension if not exists pgcrypto;

-- ---------- global tables (not tenant scoped) ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index users_email_idx on users (lower(email));

create type member_role as enum ('owner', 'admin', 'front_desk', 'practitioner');

create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role member_role not null default 'front_desk',
  practitioner_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  org_id uuid references organizations(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ip text,
  user_agent text
);
create index sessions_user_idx on sessions (user_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role member_role not null,
  practitioner_id uuid,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- tenant tables ----------
create table locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text not null default '',
  phone text not null default '',
  color text not null default '#0f766e',
  timezone text not null default 'America/Edmonton',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index locations_org_idx on locations (org_id);

create table practitioners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  name text not null,
  title text not null default '',
  discipline text not null,
  color text not null default '#2563eb',
  email text not null default '',
  phone text not null default '',
  bio text not null default '',
  online boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index practitioners_org_idx on practitioners (org_id);
alter table memberships add constraint memberships_practitioner_fk foreign key (practitioner_id) references practitioners(id) on delete set null;

create table practitioner_locations (
  org_id uuid not null references organizations(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  primary key (practitioner_id, location_id)
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_min smallint not null check (start_min between 0 and 1440),
  end_min smallint not null check (end_min between 0 and 1440 and end_min > start_min)
);
create index shifts_pr_idx on shifts (practitioner_id, weekday);

create table treatments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  discipline text not null,
  duration_min smallint not null check (duration_min > 0),
  price_cents integer not null default 0 check (price_cents >= 0),
  taxable boolean not null default false,
  is_assessment boolean not null default false,
  online boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0
);
create index treatments_org_idx on treatments (org_id);

create table practitioner_treatments (
  org_id uuid not null references organizations(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  treatment_id uuid not null references treatments(id) on delete cascade,
  primary key (practitioner_id, treatment_id)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  price_cents integer not null default 0,
  taxable boolean not null default true,
  active boolean not null default true
);
create index products_org_idx on products (org_id);

create table patients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  dob date,
  sex text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  province text not null default '',
  postal text not null default '',
  health_number text not null default '',
  home_location_id uuid references locations(id) on delete set null,
  emergency_name text not null default '',
  emergency_phone text not null default '',
  notes text not null default '',
  alerts text not null default '',
  tags text[] not null default '{}',
  referred_by text not null default '',
  complaint text not null default '',
  consent_on_file boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index patients_org_name_idx on patients (org_id, last_name, first_name);
create index patients_org_email_idx on patients (org_id, lower(email));
create index patients_org_phone_idx on patients (org_id, phone);

create table patient_insurers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  company text not null,
  policy text not null default '',
  member_id text not null default '',
  coverage_pct smallint not null default 80 check (coverage_pct between 0 and 100),
  annual_max_cents integer not null default 0,
  sort_order smallint not null default 0
);
create index patient_insurers_patient_idx on patient_insurers (patient_id);

create type appt_status as enum ('booked', 'arrived', 'in_progress', 'completed', 'no_show', 'cancelled');
create type appt_source as enum ('staff', 'online', 'api');

create table appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id),
  location_id uuid not null references locations(id),
  treatment_id uuid not null references treatments(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  status appt_status not null default 'booked',
  notes text not null default '',
  source appt_source not null default 'staff',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_org_start_idx on appointments (org_id, starts_at);
create index appointments_pr_start_idx on appointments (practitioner_id, starts_at);
create index appointments_patient_idx on appointments (patient_id, starts_at);

create table chart_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  discipline text not null default '',
  sections jsonb not null default '[]'::jsonb,
  active boolean not null default true
);
create index chart_templates_org_idx on chart_templates (org_id);

create table charts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  patient_id uuid not null references patients(id) on delete cascade,
  practitioner_id uuid not null references practitioners(id),
  location_id uuid references locations(id) on delete set null,
  service_date timestamptz not null,
  template_id uuid references chart_templates(id) on delete set null,
  template_name text not null,
  fields jsonb not null default '{}'::jsonb,
  signed boolean not null default false,
  signed_at timestamptz,
  signed_by uuid references users(id) on delete set null,
  addenda jsonb not null default '[]'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index charts_patient_idx on charts (patient_id, service_date desc);
create unique index charts_appointment_idx on charts (appointment_id) where appointment_id is not null;

create table invoice_counters (
  org_id uuid primary key references organizations(id) on delete cascade,
  next_number integer not null default 1001
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  number text not null,
  patient_id uuid not null references patients(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  practitioner_id uuid references practitioners(id) on delete set null,
  issued_at timestamptz not null default now(),
  items jsonb not null default '[]'::jsonb,
  discount_cents integer not null default 0,
  tax_rate_bp integer not null default 500,
  tax_name text not null default 'GST',
  insurer text not null default '',
  insurer_portion_cents integer not null default 0,
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  note text not null default '',
  voided boolean not null default false,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, number)
);
create index invoices_org_issued_idx on invoices (org_id, issued_at desc);
create index invoices_patient_idx on invoices (patient_id);
create unique index invoices_appointment_idx on invoices (appointment_id) where appointment_id is not null;

create table payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  paid_at timestamptz not null default now(),
  method text not null,
  amount_cents integer not null check (amount_cents > 0),
  note text not null default '',
  created_by uuid references users(id) on delete set null
);
create index payments_invoice_idx on payments (invoice_id);

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  treatment_id uuid references treatments(id) on delete set null,
  practitioner_id uuid references practitioners(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index waitlist_org_idx on waitlist (org_id);

create table intake_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  fields jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index intake_forms_org_idx on intake_forms (org_id);

create table intake_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  form_id uuid not null references intake_forms(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  token_hash text unique,
  answers jsonb,
  signature text,
  sent_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index intake_submissions_patient_idx on intake_submissions (patient_id);

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{read}',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_org_idx on api_keys (org_id);

create table audit_log (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid,
  actor text not null default '',
  action text not null,
  entity text not null,
  entity_id uuid,
  patient_id uuid,
  details jsonb not null default '{}'::jsonb,
  ip text,
  at timestamptz not null default now()
);
create index audit_log_org_at_idx on audit_log (org_id, at desc);
create index audit_log_patient_idx on audit_log (patient_id, at desc);

-- ---------- row-level security ----------
-- app.org_id is set per transaction by the application (set_config(..., true)).
create or replace function current_org_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

do $$
declare t text;
begin
  foreach t in array array['locations','practitioners','practitioner_locations','shifts','treatments','practitioner_treatments','products',
                            'patients','patient_insurers','appointments','chart_templates','charts','invoice_counters','invoices','payments',
                            'waitlist','intake_forms','intake_submissions','api_keys','audit_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I using (org_id = current_org_id()) with check (org_id = current_org_id())', t);
  end loop;
end $$;

-- audit log is append-only for the application role
create policy audit_no_update on audit_log as restrictive for update using (false);
create policy audit_no_delete on audit_log as restrictive for delete using (false);

-- The application connects as clinicflow_app, which is not the table owner, so RLS applies to it.
grant usage on schema public to clinicflow_app;
grant select, insert, update, delete on all tables in schema public to clinicflow_app;
grant usage, select on all sequences in schema public to clinicflow_app;
alter default privileges for role clinicflow_owner in schema public grant select, insert, update, delete on tables to clinicflow_app;
alter default privileges for role clinicflow_owner in schema public grant usage, select on sequences to clinicflow_app;
