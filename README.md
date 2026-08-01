# KP Supplier Order Tracker

A lightweight supplier order tracking app with Supabase cloud sync support.

## What is included

- `index.html` — main frontend UI
- `style.css` — styling for dashboard, forms, and tables
- `app.js` — app logic, local storage support, and Supabase sync
- `vercel.json` — ready for static deployment on Vercel
- `.gitignore` — standard ignores for deployment

## Ready-to-use features

- Supplier add/edit/delete
- Order add/edit/delete
- Dashboard with today stats and upcoming deliveries
- Reports by date, supplier, and status
- Supabase cloud sync via anon key
- Startup sanitization for legacy order data

## Local development

Use a static server from the project folder:

```bash
cd "c:\Users\Home User\Desktop\Supplier Managment"
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/index.html
```

## Supabase setup

Create a Supabase project and run this SQL in the SQL editor:

```sql
create table public.suppliers (
  id text primary key,
  name text,
  company text,
  phone text,
  email text,
  address text,
  visit_days jsonb default '[]'::jsonb,
  status text,
  notes text,
  created_at text,
  updated_at text
);

create table public.orders (
  id text primary key,
  supplier_id text,
  supplier_name text,
  order_date text,
  delivery_date text,
  amount numeric,
  paid_cash numeric,
  paid_bank numeric,
  due_amount numeric,
  status text,
  verified boolean,
  remarks text,
  created_at text,
  updated_at text
);

alter table public.suppliers enable row level security;
alter table public.orders enable row level security;

create policy "suppliers_read_write" on public.suppliers
  for all using (true) with check (true);

create policy "orders_read_write" on public.orders
  for all using (true) with check (true);
```

> The app uses the Supabase anon key from the `Cloud Sync` modal, so these policies must allow anonymous access.

## Deploy to GitHub

1. Initialize git in the folder if needed:

```bash
git init
git add .
git commit -m "Initial KP Supplier Order Tracker"
```

2. Push to your GitHub repository.

## Deploy to Vercel

1. Create a Vercel account if you don't have one.
2. Import the GitHub repo in Vercel.
3. Use the existing `vercel.json` configuration.
4. Deploy the project as a static site.

## After deployment

1. Open the app in Vercel.
2. Click `Cloud Sync`.
3. Paste your Supabase project URL and anon key.
4. Save and start using the app.
