"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRealtime } from "@/lib/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";
import type { Location, Product, StockMove, Warehouse } from "@/lib/types";
import { fmtDateTime, fmtQty } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  incoming: "Incoming",
  outgoing: "Outgoing",
  internal: "Internal",
};

const TYPE_CLASS: Record<string, string> = {
  incoming: "border-emerald-200 bg-emerald-50 text-emerald-700",
  outgoing: "border-rose-200 bg-rose-50 text-rose-700",
  internal: "border-sky-200 bg-sky-50 text-sky-700",
};

export default function MoveHistoryPage() {
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("");
  const [whFilter, setWhFilter] = useState("");
  const [search, setSearch] = useState("");

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [cm, cp, cw, cl] = await Promise.all([
      supabase
        .from("stock_moves")
        .select("*, products(sku, name, uom)")
        .order("occurred_at", { ascending: false })
        .limit(500),
      supabase.from("products").select("*").order("name"),
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("locations").select("*, warehouses(name)").order("name"),
    ]);
    setMoves((cm.data as StockMove[]) ?? []);
    setProducts((cp.data as Product[]) ?? []);
    setWarehouses((cw.data as Warehouse[]) ?? []);
    setLocations((cl.data as unknown as Location[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useRealtime(["stock_moves"], fetchAll);

  const locName = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locations) m.set(l.id, l.name);
    return m;
  }, [locations]);

  const whOfLoc = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locations) m.set(l.id, l.warehouse_id);
    return m;
  }, [locations]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return moves.filter((m) => {
      if (typeFilter !== "all" && m.move_type !== typeFilter) return false;
      if (productFilter && m.product_id !== productFilter) return false;
      if (whFilter) {
        const inWh =
          (m.source_location_id && whOfLoc.get(m.source_location_id) === whFilter) ||
          (m.destination_location_id && whOfLoc.get(m.destination_location_id) === whFilter);
        if (!inWh) return false;
      }
      if (q && !`${m.products?.name ?? ""} ${m.products?.sku ?? ""} ${m.reference ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [moves, typeFilter, productFilter, whFilter, search, whOfLoc]);

  return (
    <AppShell
      title="Move History"
      subtitle="Every stock movement, logged — the complete stock ledger"
    >
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input
          className="input max-w-xs"
          placeholder="Search product, SKU, reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-44" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="incoming">Incoming</option>
          <option value="outgoing">Outgoing</option>
          <option value="internal">Internal</option>
        </select>
        <select className="input w-48" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
          ))}
        </select>
        <select className="input w-48" value={whFilter} onChange={(e) => setWhFilter(e.target.value)}>
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">When</th>
              <th className="th">Type</th>
              <th className="th">Product</th>
              <th className="th text-right">Qty</th>
              <th className="th">From</th>
              <th className="th">To</th>
              <th className="th">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="td" colSpan={7}>Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  No stock movements yet. Validate a receipt, delivery or transfer and it will appear here instantly.
                </td>
              </tr>
            ) : (
              visible.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="td text-slate-500">{fmtDateTime(m.occurred_at)}</td>
                  <td className="td">
                    <span className={`badge ${TYPE_CLASS[m.move_type] ?? ""}`}>
                      {TYPE_LABEL[m.move_type] ?? m.move_type}
                    </span>
                  </td>
                  <td className="td">
                    <span className="font-semibold text-slate-800">{m.products?.name ?? "—"}</span>
                    <span className="ml-2 font-mono text-xs text-slate-400">{m.products?.sku}</span>
                  </td>
                  <td className="td text-right font-semibold">
                    {m.move_type === "outgoing" ? "−" : m.move_type === "incoming" ? "+" : "→"}
                    {fmtQty(Number(m.quantity))} {m.products?.uom}
                  </td>
                  <td className="td">{m.source_location_id ? locName.get(m.source_location_id) ?? "—" : "—"}</td>
                  <td className="td">{m.destination_location_id ? locName.get(m.destination_location_id) ?? "—" : "—"}</td>
                  <td className="td font-mono text-xs text-slate-500">{m.reference ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
