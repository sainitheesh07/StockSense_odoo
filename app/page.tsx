"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppShell from "@/components/AppShell";
import StatCard from "@/components/StatCard";
import Filters, { type FilterState } from "@/components/Filters";
import { useRealtime } from "@/lib/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";
import type {
  Category,
  DashboardCounts,
  Product,
  Receipt,
  Transfer,
  TrendPoint,
  Delivery,
  Warehouse,
} from "@/lib/types";
import { DOC_TYPES, fmtQty, type DocType, effectiveMinQty, totalOnHand, DEFAULT_MIN_STOCK } from "@/lib/types";

const PENDING: Record<string, string[]> = {
  receipts: ["draft", "waiting", "ready"],
  deliveries: ["draft", "waiting", "ready"],
  transfers: ["draft", "waiting", "ready"],
  adjustments: ["draft", "waiting", "ready"],
};

export default function DashboardPage() {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [ops, setOps] = useState<{
    receipts: Receipt[];
    deliveries: Delivery[];
    transfers: Transfer[];
    adjustments: { id: string; name: string; state: string; created_at: string }[];
  }>({ receipts: [], deliveries: [], transfers: [], adjustments: [] });
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    docTypes: [...DOC_TYPES],
    states: ["draft", "waiting", "ready", "done", "canceled"],
    warehouseId: "",
    categoryId: "",
  });

  const fetchAll = useCallback(async () => {
    const supabase = createClient();

    const [cw, cc, cp, cr, cd, ct, ca, cm] = await Promise.all([
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("product_categories").select("*").order("name"),
      supabase
        .from("products")
        .select("*, product_categories(name), reorder_rules(min_qty), stock_quant(quantity)"),
      supabase
        .from("receipts")
        .select("*, warehouses(name, short_code)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("delivery_orders")
        .select("*, warehouses(name, short_code)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("transfers")
        .select("*, source_wh:warehouses!source_warehouse_id(name, short_code)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("adjustments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("stock_moves")
        .select("move_type, quantity, occurred_at")
        .eq("state", "done")
        .gte("occurred_at", new Date(Date.now() - 13 * 86400000).toISOString()),
    ]);

    const wh = cw.data ?? [];
    const prods = (cp.data as Product[]) ?? [];
    const recs = (cr.data as Receipt[]) ?? [];
    const dels = (cd.data as Delivery[]) ?? [];
    const trns = (ct.data as Transfer[]) ?? [];
    const adjs = ca.data ?? [];
    const moves = cm.data ?? [];

    setWarehouses(wh);
    setCategories(cc.data ?? []);
    setProducts(prods);
    setOps({ receipts: recs, deliveries: dels, transfers: trns, adjustments: adjs });

    // ---- KPIs from live data
    const inStock = prods.filter((p) => totalOnHand(p.stock_quant) > 0).length;

    let low = 0;
    let out = 0;
    for (const p of prods) {
      const total = totalOnHand(p.stock_quant);
      const min = effectiveMinQty(p.reorder_rules);
      if (total <= 0) out += 1;
      else if (total <= min) low += 1;
    }

    setCounts({
      total_products_in_stock: inStock,
      low_stock: low,
      out_of_stock: out,
      pending_receipts: recs.filter((r) =>
        PENDING.receipts.includes(r.state)
      ).length,
      pending_deliveries: dels.filter((d) =>
        PENDING.deliveries.includes(d.state)
      ).length,
      pending_transfers: trns.filter((t) =>
        PENDING.transfers.includes(t.state)
      ).length,
    });

    // ---- 14-day trend
    const byDay = new Map<string, { incoming: number; outgoing: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      byDay.set(d.toISOString().slice(0, 10), { incoming: 0, outgoing: 0 });
    }
    for (const m of moves) {
      const day = (m.occurred_at as string).slice(0, 10);
      const entry = byDay.get(day);
      if (!entry) continue;
      if (m.move_type === "incoming") entry.incoming += Number(m.quantity);
      else if (m.move_type === "outgoing") entry.outgoing += Number(m.quantity);
    }
    setTrend(
      Array.from(byDay.entries()).map(([day, v]) => ({
        day: day.slice(5),
        ...v,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const { connected } = useRealtime(
    [
      "products",
      "stock_quant",
      "stock_moves",
      "receipts",
      "delivery_orders",
      "transfers",
      "adjustments",
      "reorder_rules",
    ],
    fetchAll
  );

  // ---- dynamic filters applied across all document types
  const filtered = useMemo(() => {
    const match = (
      type: DocType,
      state: string,
      warehouseId: string | null,
      productCategoryIds: string[] | null
    ) => {
      if (!filters.docTypes.includes(type)) return false;
      if (!filters.states.includes(state as never)) return false;
      if (filters.warehouseId && warehouseId !== filters.warehouseId)
        return false;
      if (filters.categoryId) {
        if (!productCategoryIds) return false;
        if (!productCategoryIds.includes(filters.categoryId)) return false;
      }
      return true;
    };

    const catOf = new Map(products.map((p) => [p.id, p.category_id]));

    return {
      receipts: ops.receipts.filter((r) =>
        match("receipts", r.state, r.warehouse_id, null)
      ),
      deliveries: ops.deliveries.filter((d) =>
        match("deliveries", d.state, d.warehouse_id, null)
      ),
      transfers: ops.transfers.filter((t) =>
        match("transfers", t.state, t.source_warehouse_id, null)
      ),
      adjustments: (ops.adjustments as { id: string; name: string; state: string; warehouse_id: string; created_at: string }[]).filter(
        (a) => match("adjustments", a.state, a.warehouse_id, null)
      ),
    };
  }, [ops, filters, products]);

  const recentDoc = useMemo(() => {
    const rows: {
      id: string;
      href: string;
      name: string;
      type: string;
      state: string;
      date: string;
    }[] = [];
    filtered.receipts.slice(0, 8).forEach((r) =>
      rows.push({ id: r.id, href: "/operations/receipts", name: r.name, type: "Receipt", state: r.state, date: r.created_at })
    );
    filtered.deliveries.slice(0, 8).forEach((d) =>
      rows.push({ id: d.id, href: "/operations/deliveries", name: d.name, type: "Delivery", state: d.state, date: d.created_at })
    );
    filtered.transfers.slice(0, 8).forEach((t) =>
      rows.push({ id: t.id, href: "/operations/transfers", name: t.name, type: "Transfer", state: t.state, date: t.created_at })
    );
    filtered.adjustments.slice(0, 8).forEach((a) =>
      rows.push({ id: a.id, href: "/operations/adjustments", name: a.name, type: "Adjustment", state: a.state, date: a.created_at })
    );
    return rows
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [filtered]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory Dashboard</h1>
          <p className="text-sm text-slate-500">
            Live snapshot of all stock operations
          </p>
        </div>
        <RealtimeBadge connected={connected} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Products in Stock"
          value={counts ? fmtQty(counts.total_products_in_stock) : "…"}
          accent="bg-brand-600"
          href="/products"
          hint="products with positive on-hand quantity"
        />
        <StatCard
          title="Low / Out of Stock"
          value={counts ? `${fmtQty(counts.low_stock)} / ${fmtQty(counts.out_of_stock)}` : "…"}
          accent="bg-amber-500"
          href="/products?filter=low"
          hint={`at/below min (default ${DEFAULT_MIN_STOCK}) — / zero on hand`}
        />
        <StatCard
          title="Pending Receipts"
          value={counts ? fmtQty(counts.pending_receipts) : "…"}
          accent="bg-emerald-600"
          href="/operations/receipts"
          hint="incoming goods awaiting validation"
        />
        <StatCard
          title="Pending Deliveries"
          value={counts ? fmtQty(counts.pending_deliveries) : "…"}
          accent="bg-sky-600"
          href="/operations/deliveries"
          hint="outgoing orders to pick, pack & validate"
        />
        <StatCard
          title="Transfers Scheduled"
          value={counts ? fmtQty(counts.pending_transfers) : "…"}
          accent="bg-violet-600"
          href="/operations/transfers"
          hint="internal transfers in progress"
        />
        <StatCard
          title="Stock Ledger"
          value="Move history"
          accent="bg-slate-700"
          href="/operations/move-history"
          hint="every stock movement, logged"
        />
      </div>

      <div className="mt-6">
        <Filters
          warehouses={warehouses}
          categories={categories}
          value={filters}
          onChange={setFilters}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Stock in / out — last 14 days
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="incoming" name="Incoming" fill="#059669" radius={[3, 3, 0, 0]} />
                <Bar dataKey="outgoing" name="Outgoing" fill="#e11d48" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card overflow-hidden">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Recent operations (filtered)
          </h2>
          {loading ? (
            <p className="px-4 py-6 text-sm text-slate-400">Loading…</p>
          ) : recentDoc.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400">
              No operations match the current filters. Create a receipt, delivery,
              transfer or adjustment to see it here — live.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentDoc.map((r) => (
                <li key={`${r.type}-${r.id}`} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {r.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.type} · {new Date(r.date).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="badge border-slate-200 bg-slate-50 capitalize text-slate-600">
                      {r.state}
                    </span>
                    <Link href={r.href} className="text-xs font-semibold text-brand-600 hover:underline">
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function RealtimeBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`badge ${
        connected
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
      {connected ? "Realtime connected" : "Connecting…"}
    </span>
  );
}
