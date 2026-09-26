"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { useRealtime } from "@/lib/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";
import type {
  Adjustment,
  Location,
  Product,
  QuantRow,
  Warehouse,
} from "@/lib/types";
import { MOVE_STATES, fmtDateTime, fmtQty, stateBadgeClass } from "@/lib/types";

interface CountLine {
  product_id: string;
  location_id: string;
  system: number;
  counted: number | string;
}

export default function AdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [quants, setQuants] = useState<QuantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [ca, cw, cp, cl, cq] = await Promise.all([
      supabase
        .from("adjustments")
        .select("*, warehouses(name, short_code)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("locations").select("*, warehouses(name)").order("name"),
      supabase
        .from("stock_quant")
        .select("product_id, location_id, quantity, locations(name, warehouse_id)"),
    ]);
    setAdjustments((ca.data as Adjustment[]) ?? []);
    setWarehouses((cw.data as Warehouse[]) ?? []);
    setProducts((cp.data as Product[]) ?? []);
    setLocations((cl.data as unknown as Location[]) ?? []);
    setQuants((cq.data as unknown as QuantRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useRealtime(["adjustments", "stock_quant", "stock_moves"], fetchAll);

  const visible = adjustments.filter(
    (a) => stateFilter === "all" || a.state === stateFilter
  );

  // Drafts can only linger if validation failed mid-create; they hold no lines,
  // so the correct action is to remove them rather than "validate" an empty count.
  async function removeDraft(a: Adjustment) {
    if (!confirm(`Delete draft ${a.name}? This cannot be undone.`)) return;
    setBusy(a.id);
    const { error } = await createClient()
      .from("adjustments")
      .delete()
      .eq("id", a.id);
    setBusy(null);
    if (error) alert(error.message);
    else void fetchAll();
  }

  return (
    <AppShell
      title="Inventory Adjustments"
      subtitle="Fix mismatches between recorded and physically counted stock"
      actions={
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + New adjustment
        </button>
      }
    >
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <p className="label mb-0">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {["all", ...MOVE_STATES].map((s) => (
            <button
              key={s}
              onClick={() => setStateFilter(s)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
                stateFilter === s
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Reference</th>
              <th className="th">Warehouse</th>
              <th className="th">Reason</th>
              <th className="th">Created</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="td" colSpan={6}>Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  No adjustments yet. Click “New adjustment” to count stock and fix mismatches.
                </td>
              </tr>
            ) : (
              visible.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="td font-semibold text-slate-800">{a.name}</td>
                  <td className="td">{a.warehouses?.name ?? "—"}</td>
                  <td className="td">{a.reason ?? "—"}</td>
                  <td className="td text-slate-500">{fmtDateTime(a.created_at)}</td>
                  <td className="td">
                    <span className={`badge ${stateBadgeClass(a.state)}`}>{a.state}</span>
                  </td>
                  <td className="td text-right">
                    {a.state === "draft" && (
                      <button
                        className="btn-danger !py-1 text-xs"
                        disabled={busy === a.id}
                        onClick={() => void removeDraft(a)}
                      >
                        {busy === a.id ? "Deleting…" : "Delete draft"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateAdjustment
          warehouses={warehouses}
          products={products}
          locations={locations}
          quants={quants}
          onClose={() => setShowCreate(false)}
          onCreated={fetchAll}
        />
      )}
    </AppShell>
  );
}

function CreateAdjustment({
  warehouses,
  products,
  locations,
  quants,
  onClose,
  onCreated,
}: {
  warehouses: Warehouse[];
  products: Product[];
  locations: Location[];
  quants: QuantRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [countLines, setCountLines] = useState<CountLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selProduct, setSelProduct] = useState("");
  const [selLocation, setSelLocation] = useState("");

  const whLocs = locations.filter((l) => l.warehouse_id === warehouseId);

  function systemQty(productId: string, locationId: string): number {
    const q = quants.find(
      (x) => x.product_id === productId && x.location_id === locationId
    );
    return q ? Number(q.quantity) : 0;
  }

  function addLine() {
    if (!selProduct || !selLocation) return;
    if (countLines.some((l) => l.product_id === selProduct && l.location_id === selLocation))
      return;
    setCountLines([
      ...countLines,
      {
        product_id: selProduct,
        location_id: selLocation,
        system: systemQty(selProduct, selLocation),
        counted: systemQty(selProduct, selLocation),
      },
    ]);
    setSelProduct("");
    setSelLocation("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (countLines.length === 0) return setError("Add at least one product/location to count");
    if (!warehouseId) return setError("Select a warehouse");
    const clean = countLines.filter((l) => Number(l.counted) !== l.system);
    setBusy(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data: adj, error: aErr } = await supabase
      .from("adjustments")
      .insert({
        name: "New",
        warehouse_id: warehouseId,
        reason: reason.trim() || null,
        created_by: userData.user?.id ?? null,
      })
      .select()
      .single();
    if (aErr || !adj) {
      setError(aErr?.message ?? "Could not create adjustment");
      setBusy(false);
      return;
    }
    const { error: rpcErr } = await supabase.rpc("validate_adjustment", {
      p_adjustment_id: adj.id,
      p_lines: JSON.stringify(
        countLines.map((l) => ({
          product_id: l.product_id,
          location_id: l.location_id,
          counted: Number(l.counted),
        }))
      ),
    });
    if (rpcErr) {
      // roll back the draft so no empty adjustment lingers in the list
      await supabase.from("adjustments").delete().eq("id", adj.id);
      setError(rpcErr.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
    onCreated();
  }

  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? "?";
  const prodLabel = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? `${p.name} (${p.sku})` : "?";
  };

  return (
    <Modal title="New adjustment (physical count)" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Warehouse *</label>
            <select
              className="input"
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setCountLines([]);
              }}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. damaged, cycle count…" />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <p className="label">Add product & location to count</p>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input max-w-xs" value={selProduct} onChange={(e) => setSelProduct(e.target.value)}>
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
            <select className="input max-w-xs" value={selLocation} onChange={(e) => setSelLocation(e.target.value)}>
              <option value="">Select location…</option>
              {whLocs.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <button type="button" className="btn-ghost" onClick={addLine} disabled={!selProduct || !selLocation}>
              + Add
            </button>
          </div>
        </div>

        {countLines.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Product</th>
                  <th className="th">Location</th>
                  <th className="th text-right">Recorded</th>
                  <th className="th text-right">Counted</th>
                  <th className="th text-right">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {countLines.map((l, i) => {
                  const delta = Number(l.counted) - l.system;
                  return (
                    <tr key={`${l.product_id}-${l.location_id}`}>
                      <td className="td">{prodLabel(l.product_id)}</td>
                      <td className="td">{locName(l.location_id)}</td>
                      <td className="td text-right">{fmtQty(l.system)}</td>
                      <td className="td text-right">
                        <input
                          type="number"
                          className="input !w-28 text-right"
                          min="0"
                          step="any"
                          value={l.counted}
                          onChange={(e) => {
                            const next = [...countLines];
                            next[i] = {
                              ...l,
                              counted: e.target.value === "" ? 0 : e.target.value,
                            };
                            setCountLines(next);
                          }}
                        />
                      </td>
                      <td
                        className={`td text-right font-semibold ${
                          delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-400"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {fmtQty(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-400">
          On validate, the system applies the delta per line and logs every correction in the stock ledger. Lines with no difference are skipped.
        </p>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Applying…" : "Validate adjustment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
