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
  Receipt,
  Warehouse,
} from "@/lib/types";
import { MOVE_STATES, fmtDateTime, fmtQty, stateBadgeClass } from "@/lib/types";

interface OpRow {
  receipt: Receipt;
  warehouse: string;
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [cr, cw, cp, cl] = await Promise.all([
      supabase
        .from("receipts")
        .select("*, warehouses(name, short_code), receipt_lines(*, products(sku, name, uom))")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("locations").select("*, warehouses(name)").order("name"),
    ]);
    setReceipts((cr.data as Receipt[]) ?? []);
    setWarehouses((cw.data as Warehouse[]) ?? []);
    setProducts((cp.data as Product[]) ?? []);
    setLocations((cl.data as unknown as Location[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useRealtime(["receipts", "receipt_lines"], fetchAll);

  const rows: OpRow[] = receipts.map((r) => ({
    receipt: r,
    warehouse: r.warehouses?.name ?? "—",
  }));

  const visible = rows.filter((r) => stateFilter === "all" || r.receipt.state === stateFilter);

  async function validate(r: Receipt) {
    setBusy(r.id);
    const { error } = await createClient().rpc("validate_receipt", {
      p_receipt_id: r.id,
    });
    setBusy(null);
    if (error) alert(error.message);
    else void fetchAll();
  }

  async function cancel(r: Receipt) {
    setBusy(r.id);
    await createClient().from("receipts").update({ state: "canceled" }).eq("id", r.id);
    setBusy(null);
    void fetchAll();
  }

  async function setWaiting(r: Receipt) {
    setBusy(r.id);
    await createClient().from("receipts").update({ state: "waiting" }).eq("id", r.id);
    setBusy(null);
    void fetchAll();
  }

  return (
    <AppShell
      title="Receipts"
      subtitle="Incoming stock from vendors — validate to increase stock"
      actions={
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + New receipt
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
              <th className="th">Supplier</th>
              <th className="th">Warehouse</th>
              <th className="th">Products</th>
              <th className="th">Scheduled</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="td" colSpan={7}>Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  No receipts{stateFilter !== "all" ? ` in “${stateFilter}”` : ""}. Click “New receipt” to receive goods from a vendor.
                </td>
              </tr>
            ) : (
              visible.map(({ receipt: r, warehouse }) => (
                <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(r)}>
                  <td className="td font-semibold text-slate-800">{r.name}</td>
                  <td className="td">{r.supplier ?? "—"}</td>
                  <td className="td">{warehouse}</td>
                  <td className="td">{r.receipt_lines?.length ?? 0}</td>
                  <td className="td text-slate-500">{r.scheduled_date ?? "—"}</td>
                  <td className="td">
                    <span className={`badge ${stateBadgeClass(r.state)}`}>{r.state}</span>
                  </td>
                  <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                    {r.state === "draft" && (
                      <button className="btn-ghost mr-1 !py-1 text-xs" onClick={() => void setWaiting(r)}>
                        Mark ready
                      </button>
                    )}
                    {(r.state === "ready" || r.state === "waiting") && (
                      <button
                        className="btn-success mr-1 !py-1 text-xs"
                        disabled={busy === r.id}
                        onClick={() => void validate(r)}
                      >
                        {busy === r.id ? "Validating…" : "Validate"}
                      </button>
                    )}
                    {["draft", "waiting", "ready"].includes(r.state) && (
                      <button
                        className="btn-danger !py-1 text-xs"
                        disabled={busy === r.id}
                        onClick={() => void cancel(r)}
                      >
                        Cancel
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
        <CreateReceipt
          warehouses={warehouses}
          products={products}
          locations={locations}
          onClose={() => setShowCreate(false)}
          onCreated={fetchAll}
        />
      )}
      {detail && (
        <ReceiptDetail
          receipt={receipts.find((x) => x.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
        />
      )}
    </AppShell>
  );
}

function CreateReceipt({
  warehouses,
  products,
  locations,
  onClose,
  onCreated,
}: {
  warehouses: Warehouse[];
  products: Product[];
  locations: Location[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [supplier, setSupplier] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [lines, setLines] = useState<DocLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!warehouseId) return setError("Select a warehouse");
    const clean = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (clean.length === 0) return setError("Add at least one product with a quantity");

    setBusy(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data: rec, error: rErr } = await supabase
      .from("receipts")
      .insert({
        name: "New",
        supplier: supplier.trim() || null,
        warehouse_id: warehouseId,
        scheduled_date: scheduledDate || null,
        created_by: userData.user?.id ?? null,
      })
      .select()
      .single();
    if (rErr || !rec) {
      setError(rErr?.message ?? "Could not create receipt");
      setBusy(false);
      return;
    }
    const { error: lErr } = await supabase.from("receipt_lines").insert(
      clean.map((l) => ({
        receipt_id: rec.id,
        product_id: l.product_id,
        quantity: Number(l.quantity),
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
    <Modal title="New receipt" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Warehouse *</label>
            <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Supplier</label>
            <input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Acme Steel Co." />
          </div>
          <div>
            <label className="label">Scheduled date</label>
            <input className="input" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="label">Products</p>
          <DocLines
            lines={lines}
            products={products}
            locations={locations}
            onChange={setLines}
          />
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create receipt"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiptDetail({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  return (
    <Modal title={`${receipt.name} — ${receipt.state}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <p><span className="font-semibold">Supplier:</span> {receipt.supplier ?? "—"}</p>
          <p><span className="font-semibold">Warehouse:</span> {receipt.warehouses?.name ?? "—"}</p>
          <p><span className="font-semibold">Created:</span> {fmtDateTime(receipt.created_at)}</p>
          <p><span className="font-semibold">Validated:</span> {fmtDateTime(receipt.validated_at)}</p>
        </div>
        <table className="min-w-full divide-y divide-slate-200 rounded-lg border border-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Product</th>
              <th className="th">SKU</th>
              <th className="th text-right">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(receipt.receipt_lines ?? []).map((l) => (
              <tr key={l.id}>
                <td className="td">{l.products?.name ?? "—"}</td>
                <td className="td font-mono text-xs text-slate-500">{l.products?.sku}</td>
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
