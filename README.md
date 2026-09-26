# StockSense — Real-time Inventory Management System

A modular IMS built with **Next.js 14 (App Router) + Supabase (Postgres, Auth, Realtime)**.
Replaces manual registers and scattered spreadsheets with one centralized, live app.

## Features

- **Auth** — email/password sign-up & login, OTP-based password reset, session-protected routes.
- **Dashboard** — live KPIs (products in stock, low/out-of-stock, pending receipts, pending deliveries, scheduled transfers) with dynamic filters (document type, status, warehouse, category) and a 14-day operations chart.
- **Products** — create/update products (name, SKU, category, unit of measure, initial stock), per-location availability, categories, reordering rules with low-stock alerts.
- **Operations**
  - *Receipts* — incoming stock from suppliers; validate → stock increases.
  - *Delivery Orders* — pick → pack → validate → stock decreases.
  - *Internal Transfers* — move stock between warehouses/locations; totals unchanged, location updated.
  - *Inventory Adjustments* — fix counted vs. recorded stock; delta auto-logged.
- **Move History** — complete immutable stock ledger (every move, in/out, source → destination).
- **Warehouses** — multi-warehouse support with locations.
- **Realtime** — Supabase Realtime streams: stock quantities, operations, and the ledger update live across every open client.

## Setup

1. Create the database: open the **Supabase SQL Editor** and run [`supabase/schema.sql`](./supabase/schema.sql) (idempotent; tables, RLS policies, triggers, RPCs, realtime).
2. Env vars in `.env.local` (already provided):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   ```
3. Run:
   ```bash
   npm install
   npm run dev
   ```
4. Sign up with any email + password, then start receiving, transferring, and delivering stock.

## Data model

`warehouses` → `locations` → `product_categories`, `products` (+ `reorder_rules`) →
`stock_quant` (quantity per product/location) → `stock_moves` (the ledger).
Operations: `receipts` + `receipt_lines`, `delivery_orders` + `delivery_lines`,
`transfers` + `transfer_lines`, `adjustments`. Sequenced document names
(`WH/IN/00001`, `WH/OUT/00001`, `WH/INT/00001`, `WH/ADJ/00001`).

> RLS is enabled on every table with permissive policies for authenticated users
> (single-tenant team mode). Share the schema first, then the app.
