-- Ejecutar en Supabase → SQL Editor → New query

create extension if not exists pg_trgm;

create table if not exists products (
  no text primary key,
  description text not null default '',
  base_unit_of_measure text,
  inventory_posting_group text,
  unit_price numeric,
  unit_cost numeric,
  gen_prod_posting_group text,
  vat_prod_posting_group text,
  manufacturer_code text,
  item_category_code text,
  synced_at timestamptz default now()
);

-- Índices para búsqueda rápida por texto libre (código o descripción)
create index if not exists idx_products_description_trgm
  on products using gin (description gin_trgm_ops);

create index if not exists idx_products_no_trgm
  on products using gin (no gin_trgm_ops);

create index if not exists idx_products_manufacturer
  on products (manufacturer_code);

create index if not exists idx_products_category
  on products (item_category_code);

-- Esta tabla la gestiona únicamente el backend (con la Service Role Key),
-- así que no hace falta activar políticas RLS de acceso público.
alter table products enable row level security;
