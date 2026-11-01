-- Support importing data from another practice system, and fields that system had.
alter table practitioners add column license_number text not null default '';
alter table practitioners add column external_id text;
create unique index practitioners_external_idx on practitioners (org_id, external_id) where external_id is not null;

alter table treatments add column code text not null default '';
alter table treatments add column external_id text;
create unique index treatments_external_idx on treatments (org_id, external_id) where external_id is not null;

alter table products add column code text not null default '';
alter table products add column external_id text;
create unique index products_external_idx on products (org_id, external_id) where external_id is not null;

alter table patients add column external_id text;
alter table patients add column legacy jsonb;   -- visit history summary carried over from the previous system
create unique index patients_external_idx on patients (org_id, external_id) where external_id is not null;
