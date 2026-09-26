"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import DocLines, { type DocLine } from "@/components/DocLines";
import Modal from "@/components/Modal";
import { useRealtime } from "@/lib/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";
import type {
  Location,
  Product,
  QuantRow,
  Transfer,
  Warehouse,
} from "@/lib/types";
import { MOVE_STATES, fmtDateTime, fmtQty, stateBadgeClass } from "@/lib/types";

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [quants, setQuants] = useState<QuantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Transfer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [ct, cw, cp, cl, cq] = await Promise.all([
      supabase
        .from("transfers")
        .select(`*,
          source_wh:warehouses!source_warehouse_id(name, short_code),
          dest_wh:warehouses!destination_warehouse_id(name, short_code),
          transfer_lines(*, products(sku, name, uom))`)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("locations").select("*, warehouses(name)").order("name"),
      supabase.from("stock_quant").select("product_id, location_id, quantity"),
    ]);
    if (ct.error) console.error("Failed to load transfers:", ct.error.message);
    setTransfers((ct.data as unknown as Transfer[]) ?? []);
    setWarehouses((cw.data as Warehouse[]) ?? []);
    setProducts((cp.data as Product[]) ?? []);
    setLocations((cl.data as unknown as Location[]) ?? []);
    setQuants((cq.data as QuantRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useRealtime(["transfers", "transfer_lines", "stock_quant"], fetchAll);

  const visible = transfers.filter(
    (t) => stateFilter === "all" || t.state === stateFilter
  );

  async function markReady(t: Transfer) {
    setBusy(t.id);
    await createClient().from("transfers").update({ state: "ready" }).eq("id", t.id);
    setBusy(null);
    void fetchAll();
  }

  async function validate(t: Transfer) {
    setBusy(t.id);
    const { error } = await createClient().rpc("validate_transfer", {
      p_transfer_id: t.id,
    });
    setBusy(null);
    if (error) alert(error.message);
    else void fetchAll();
  }

  async function cancel(t: Transfer) {
    setBusy(t.id);
    await createClient().from("transfers").update({ state: "canceled" }).eq("id", t.id);
    setBusy(null);
    void fetchAll();
  }

  function srcLabel(t: Transfer): string {
    const s = (t as unknown as { source_wh?: { name: string } | null }).source_wh;
    return s?.name ?? "—";
  }
  function dstLabel(t: Transfer): string {
    const d = (t as unknown as { dest_wh?: { name: string } | null }).dest_wh;
    return d?.name ?? "—";
  }

  return (
    <AppShell
      title="Internal Transfers"
      subtitle="Move stock between warehouses or locations — totals unchanged, ledger logged"
      actions={
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + New transfer
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
              <th className="th">From → To</th>
              <th className="th">Products</th>
              <th className="th">Scheduled</th>
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
                  No transfers{stateFilter !== "all" ? ` in “${stateFilter}”` : ""}. Click “New transfer” to move stock between locations.
                </td>
              </tr>
            ) : (
              visible.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(t)}>
                  <td className="td font-semibold text-slate-800">{t.name}</td>
                  <td className="td">
                    {srcLabel(t)} <span className="text-slate-400">→</span> {dstLabel(t)}
                  </td>
                  <td className="td">{t.transfer_lines?.length ?? 0}</td>
                  <td className="td text-slate-500">{t.scheduled_date ?? "—"}</td>
                  <td className="td">
                    <span className={`badge ${stateBadgeClass(t.state)}`}>{t.state}</span>
                  </td>
                  <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                    {t.state === "draft" && (
                      <button className="btn-ghost mr-1 !py-1 text-xs" onClick={() => void markReady(t)}>
                        Mark ready
                      </button>
                    )}
                    {["draft", "waiting", "ready"].includes(t.state) && (
                      <>
                        <button
                          className="btn-success mr-1 !py-1 text-xs"
                          disabled={busy === t.id}
                          onClick={() => void validate(t)}
                        >
                          {busy === t.id ? "Validating…" : "Validate"}
                        </button>
                        <button className="btn-danger !py-1 text-xs" disabled={busy === t.id} onClick={() => void cancel(t)}>
                          Cancel
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateTransfer
          warehouses={warehouses}
          products={products}
          locations={locations}
          quants={quants}
          onClose={() => setShowCreate(false)}
          onCreated={fetchAll}
        />
      )}
      {detail && (
        <TransferDetail
          transfer={transfers.find((x) => x.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
        />
      )}
    </AppShell>
  );
}

function CreateTransfer({
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
  const [srcWh, setSrcWh] = useState(warehouses[0]?.id ?? "");
  const [dstWh, setDstWh] = useState(warehouses[1]?.id ?? warehouses[0]?.id ?? "");
  const [scheduledDate, setScheduledDate] = useState("");
  const [lines, setLines] = useState<DocLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const srcLocs = locations.filter((l) => l.warehouse_id === srcWh);
  const dstLocs = locations.filter((l) => l.warehouse_id === dstWh);

  // available stock per product across source warehouse locations
  const srcStock: Record<string, number> = {};
  const srcLocIds = new Set(srcLocs.map((l) => l.id));
  for (const q of quants) {
    if (srcLocIds.has(q.location_id)) {
      srcStock[q.product_id] = (srcStock[q.product_id] ?? 0) + Number(q.quantity);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!srcWh || !dstWh) return setError("Select source and destination warehouses");
    if (lines.length === 0) return setError("Add at least one product line");
    for (const l of lines) {
      if (!l.product_id || Number(l.quantity) <= 0) return setError("Every line needs a product and positive quantity");
      if (!l.source_location_id || !l.destination_location_id)
        return setError("Every line needs source and destination locations");
    }

    setBusy(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data: tr, error: tErr } = await supabase
      .from("transfers")
      .insert({
        name: "New",
        source_warehouse_id: srcWh,
        destination_warehouse_id: dstWh,
        scheduled_date: scheduledDate || null,
        created_by: userData.user?.id ?? null,
      })
      .select()
      .single();
    if (tErr || !tr) {
      setError(tErr?.message ?? "Could not create transfer");
      setBusy(false);
      return;
    }
    const { error: lErr } = await supabase.from("transfer_lines").insert(
      lines.map((l) => ({
        transfer_id: tr.id,
        product_id: l.product_id,
        quantity: Number(l.quantity),
        source_location_id: l.source_location_id,
        destination_location_id: l.destination_location_id,
      }))
    );
    if (lErr) {
      setError(lErr.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
    onCreated();
  }

  return (
    <Modal title="New internal transfer" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">From warehouse *</label>
            <select
              className="input"
              value={srcWh}
              onChange={(e) => {
                setSrcWh(e.target.value);
                setLines([]);
              }}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">To warehouse *</label>
            <select
              className="input"
              value={dstWh}
              onChange={(e) => {
                setDstWh(e.target.value);
                setLines([]);
              }}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Scheduled date</label>
            <input className="input" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="label">Lines — pick source & destination location for each product (on-hand shown for source warehouse)</p>
          <DocLines
            lines={lines}
            products={products}
            locations={locations}
            onChange={setLines}
            showLocations
            sourceWarehouseId={srcWh}
            destinationWarehouseId={dstWh}
            stockByProduct={srcStock}
          />
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create transfer"}</button>
        </div>
      </form>
    </Modal>
  );
}

function TransferDetail({ transfer, onClose }: { transfer: Transfer; onClose: () => void }) {
  return (
    <Modal title={`${transfer.name} — ${transfer.state}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <p><span className="font-semibold">Created:</span> {fmtDateTime(transfer.created_at)}</p>
          <p><span className="font-semibold">Validated:</span> {fmtDateTime(transfer.validated_at)}</p>
        </div>
        <table className="min-w-full divide-y divide-slate-200 rounded-lg border border-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Product</th>
              <th className="th text-right">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(transfer.transfer_lines ?? []).map((l) => (
              <tr key={l.id}>
                <td className="td">{l.products?.name ?? "—"}</td>
                <td className="td text-right font-semibold">
                  {fmtQty(Number(l.quantity))} {l.products?.uom}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
