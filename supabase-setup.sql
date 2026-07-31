create table if not exists public.suppliers (
  id text primary key,
  name text,
  company text,
  phone text,
  email text,
  address text,
  visit_days text[],
  status text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id text primary key,
  supplier_id text,
  supplier_name text,
  order_date date,
  delivery_date date,
  amount numeric default 0,
  paid_cash numeric default 0,
  paid_bank numeric default 0,
  due_amount numeric default 0,
  payment_status text,
  verified boolean default false,
  status text,
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.suppliers enable row level security;
alter table public.orders enable row level security;

grant usage on schema public to anon, authenticated;
grant all on table public.suppliers to anon, authenticated;
grant all on table public.orders to anon, authenticated;

drop policy if exists suppliers_all_access on public.suppliers;
drop policy if exists orders_all_access on public.orders;

create policy suppliers_all_access
  on public.suppliers
  for all
  using (true)
  with check (true);

create policy orders_all_access
  on public.orders
  for all
  using (true)
  with check (true);
