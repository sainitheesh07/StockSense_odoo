"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import DocLines, { type DocLine } from "@/components/DocLines";
import Modal from "@/components/Modal";
import { useRealtime } from "@/lib/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";
import type {
  Delivery,
  Location,
  Product,
  QuantRow,
  Warehouse,
} from "@/lib/types";
import { MOVE_STATES, fmtDateTime, fmtQty, stateBadgeClass } from "@/lib/types";

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quants, setQuants] = useState<QuantRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [cd, cw, cp, cq, cl] = await Promise.all([
      supabase
        .from("delivery_orders")
        .select("*, warehouses(name, short_code), delivery_lines(*, products(sku, name, uom))")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase
        .from("stock_quant")
        .select("product_id, location_id, quantity, locations(warehouse_id)"),
      supabase.from("locations").select("*, warehouses(name)").order("name"),
    ]);
    setDeliveries((cd.data as Delivery[]) ?? []);
    setWarehouses((cw.data as Warehouse[]) ?? []);
    setProducts((cp.data as Product[]) ?? []);
    setQuants((cq.data as unknown as QuantRow[]) ?? []);
    setLocations((cl.data as unknown as Location[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useRealtime(["delivery_orders", "delivery_lines", "stock_quant"], fetchAll);

  const visible = deliveries.filter(
    (d) => stateFilter === "all" || d.state === stateFilter
  );

  // available stock per product for a given warehouse
  function stockIn(warehouseId: string): Record<string, number> {
    const whLocIds = new Set(
      locations.filter((l) => l.warehouse_id === warehouseId).map((l) => l.id)
    );
    const map: Record<string, number> = {};
    for (const q of quants) {
      if (whLocIds.has(q.location_id)) {
        map[q.product_id] = (map[q.product_id] ?? 0) + Number(q.quantity);
      }
    }
    return map;
  }

  async function step(d: Delivery, action: "pick" | "pack") {
    setBusy(d.id);
    const now = new Date().toISOString();
    const patch = action === "pick" ? { picked_at: now, state: "ready" as const } : { packed_at: now };
    const { error } = await createClient()
      .from("delivery_orders")
      .update(patch)
      .eq("id", d.id);
    setBusy(null);
    if (error) alert(error.message);
    else void fetchAll();
  }

  async function validate(d: Delivery) {
    setBusy(d.id);
    const { error } = await createClient().rpc("validate_delivery", {
      p_delivery_id: d.id,
    });
    setBusy(null);
    if (error) alert(error.message);
    else void fetchAll();
  }

  async function cancel(d: Delivery) {
    setBusy(d.id);
    await createClient().from("delivery_orders").update({ state: "canceled" }).eq("id", d.id);
    setBusy(null);
    void fetchAll();
  }

  function stepLabel(d: Delivery): string {
    if (d.state === "done") return "Done";
    if (!d.picked_at) return "Pick";
    if (!d.packed_at) return "Pack";
    return "Validate";
  }

  return (
    <AppShell
      title="Delivery Orders"
      subtitle="Outgoing stock to customers — pick, pack, validate to decrease stock"
      actions={
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + New delivery
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
              <th className="th">Customer</th>
              <th className="th">Warehouse</th>
              <th className="th">Products</th>
              <th className="th">Status</th>
              <th className="th">Next step</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="td" colSpan={7}>Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  No delivery orders{stateFilter !== "all" ? ` in “${stateFilter}”` : ""}. Click “New delivery” to ship stock to a customer.
                </td>
              </tr>
            ) : (
              visible.map((d) => (
                <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(d)}>
                  <td className="td font-semibold text-slate-800">{d.name}</td>
                  <td className="td">{d.customer ?? "—"}</td>
                  <td className="td">{d.warehouses?.name ?? "—"}</td>
                  <td className="td">{d.delivery_lines?.length ?? 0}</td>
                  <td className="td">
                    <span className={`badge ${stateBadgeClass(d.state)}`}>{d.state}</span>
                    {d.picked_at && d.state !== "done" && (
                      <span className="ml-1 badge border-sky-200 bg-sky-50 text-sky-700">picked</span>
                    )}
                    {d.packed_at && d.state !== "done" && (
                      <span className="ml-1 badge border-violet-200 bg-violet-50 text-violet-700">packed</span>
                    )}
                  </td>
                  <td className="td font-medium text-slate-600">{stepLabel(d)}</td>
                  <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                    {["draft", "waiting", "ready"].includes(d.state) && stepLabel(d) !== "Validate" && (
                      <button
                        className="btn-ghost mr-1 !py-1 text-xs"
                        disabled={busy === d.id}
                        onClick={() => void step(d, !d.picked_at ? "pick" : "pack")}
                      >
                        {stepLabel(d)}
                      </button>
                    )}
                    {["draft", "waiting", "ready"].includes(d.state) && stepLabel(d) === "Validate" && (
                      <button
                        className="btn-success mr-1 !py-1 text-xs"
                        disabled={busy === d.id}
                        onClick={() => void validate(d)}
                      >
                        {busy === d.id ? "Validating…" : "Validate"}
                      </button>
                    )}
                    {["draft", "waiting", "ready"].includes(d.state) && (
                      <button className="btn-danger !py-1 text-xs" disabled={busy === d.id} onClick={() => void cancel(d)}>
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
        <CreateDelivery
          warehouses={warehouses}
          products={products}
          locations={locations}
          stockByWarehouse={(whId) => stockIn(whId)}
          onClose={() => setShowCreate(false)}
          onCreated={fetchAll}
        />
      )}
      {detail && (
        <DeliveryDetail
          delivery={deliveries.find((x) => x.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
        />
      )}
    </AppShell>
  );
}

function CreateDelivery({
  warehouses,
  products,
  locations,
  stockByWarehouse,
  onClose,
  onCreated,
}: {
  warehouses: Warehouse[];
  products: Product[];
  locations: Location[];
  stockByWarehouse: (whId: string) => Record<string, number>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [customer, setCustomer] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [lines, setLines] = useState<DocLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stock = warehouseId ? stockByWarehouse(warehouseId) : {};

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!warehouseId) return setError("Select a warehouse");
    const clean = lines.filter((l) => l.product_id && Number(l.quantity) > 0);
    if (clean.length === 0) return setError("Add at least one product with a quantity");

    setBusy(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data: del, error: dErr } = await supabase
      .from("delivery_orders")
      .insert({
        name: "New",
        customer: customer.trim() || null,
        warehouse_id: warehouseId,
        scheduled_date: scheduledDate || null,
        created_by: userData.user?.id ?? null,
      })
      .select()
      .single();
    if (dErr || !del) {
      setError(dErr?.message ?? "Could not create delivery order");
      setBusy(false);
      return;
    }
    const { error: lErr } = await supabase.from("delivery_lines").insert(
      clean.map((l) => ({
        delivery_id: del.id,
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
    <Modal title="New delivery order" onClose={onClose} wide>
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
            <label className="label">Customer</label>
            <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Furniture Mart" />
          </div>
          <div>
            <label className="label">Scheduled date</label>
            <input className="input" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="label">Products (on-hand shown against current warehouse)</p>
          <DocLines
            lines={lines}
            products={products}
            locations={locations}
            onChange={setLines}
            stockByProduct={stock}
          />
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create delivery"}</button>
        </div>
      </form>
    </Modal>
  );
}

function DeliveryDetail({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  return (
    <Modal title={`${delivery.name} — ${delivery.state}`} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <p><span className="font-semibold">Customer:</span> {delivery.customer ?? "—"}</p>
          <p><span className="font-semibold">Warehouse:</span> {delivery.warehouses?.name ?? "—"}</p>
          <p><span className="font-semibold">Picked:</span> {fmtDateTime(delivery.picked_at)}</p>
          <p><span className="font-semibold">Packed:</span> {fmtDateTime(delivery.packed_at)}</p>
          <p><span className="font-semibold">Created:</span> {fmtDateTime(delivery.created_at)}</p>
          <p><span className="font-semibold">Validated:</span> {fmtDateTime(delivery.validated_at)}</p>
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
            {(delivery.delivery_lines ?? []).map((l) => (
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
