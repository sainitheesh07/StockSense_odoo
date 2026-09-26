"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import CategoryDialog from "@/components/CategoryDialog";
import Modal from "@/components/Modal";
import { useRealtime } from "@/lib/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";
import type {
  Category,
  Location,
  Product,
  QuantRow,
  Warehouse,
} from "@/lib/types";
import { UOMS, fmtQty, effectiveMinQty, totalOnHand, DEFAULT_MIN_STOCK } from "@/lib/types";

interface Row {
  product: Product;
  total: number;
  status: "in" | "low" | "out";
}

interface QuantWithWh extends QuantRow {
  locations?: { name: string; warehouse_id: string; warehouses?: { name: string } } | null;
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsInner />
    </Suspense>
  );
}

function ProductsInner() {
  const params = useSearchParams();
  const lowOnly = params.get("filter") === "low";

  const [products, setProducts] = useState<Product[]>([]);
  const [quants, setQuants] = useState<QuantRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [whFilter, setWhFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Product | null>(null);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [cp, cq, cc, cwh, cl] = await Promise.all([
      supabase
        .from("products")
        .select("*, product_categories(name), reorder_rules(min_qty, max_qty)")
        .order("created_at", { ascending: false }),
      supabase
        .from("stock_quant")
        .select("*, locations(name, warehouse_id, warehouses(name))")
        .gt("quantity", 0)
        .order("updated_at", { ascending: false }),
      supabase.from("product_categories").select("*").order("name"),
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("locations").select("*, warehouses(name)").order("name"),
    ]);
    setProducts((cp.data as Product[]) ?? []);
    setQuants((cq.data as QuantRow[]) ?? []);
    setCategories((cc.data as Category[]) ?? []);
    setWarehouses((cwh.data as Warehouse[]) ?? []);
    setLocations((cl.data as unknown as Location[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useRealtime(["products", "stock_quant", "reorder_rules", "product_categories"], fetchAll);

  const rows: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .map((p) => {
        const mine = quants.filter((x) => x.product_id === p.id);
        const total = mine.reduce((s, x) => s + Number(x.quantity), 0);
        const min = effectiveMinQty(p.reorder_rules);
        const status: Row["status"] =
          total <= 0 ? "out" : total <= min ? "low" : "in";
        return { product: p, total, status };
      })
      .filter((r) => {
        if (q && !(`${r.product.name} ${r.product.sku}`.toLowerCase().includes(q)))
          return false;
        if (catFilter && r.product.category_id !== catFilter) return false;
        if (whFilter && !quants.some((x) => x.product_id === r.product.id && x.locations?.warehouse_id === whFilter))
          return false;
        if (lowOnly && r.status === "in") return false;
        return true;
      });
  }, [products, quants, search, catFilter, whFilter, lowOnly]);

  const totals = useMemo(() => {
    const inCount = rows.filter((r) => r.status === "in").length;
    const low = rows.filter((r) => r.status === "low").length;
    const out = rows.filter((r) => r.status === "out").length;
    return { inCount, low, out };
  }, [rows]);

  return (
    <AppShell
      title="Products"
      subtitle={`${rows.length} products · ${totals.inCount} in stock · ${totals.low} low · ${totals.out} out`}
      actions={
        <div className="flex gap-2">
          <CategoryDialog onCreated={fetchAll} />
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New product
          </button>
        </div>
      }
    >
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input
          className="input max-w-xs"
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-48" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input w-48" value={whFilter} onChange={(e) => setWhFilter(e.target.value)}>
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        {(search || catFilter || whFilter || lowOnly) && (
          <button className="btn-ghost" onClick={() => { setSearch(""); setCatFilter(""); setWhFilter(""); }}>
            Clear
          </button>
        )}
        {lowOnly && (
          <span className="badge border-amber-200 bg-amber-50 text-amber-700">
            Showing low / out-of-stock only
          </span>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Product</th>
              <th className="th">SKU</th>
              <th className="th">Category</th>
              <th className="th">UoM</th>
              <th className="th text-right">On hand</th>
              <th className="th text-right">Min</th>
              <th className="th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="td" colSpan={7}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  No products yet. Click “New product” to create your first one.
                </td>
              </tr>
            ) : (
              rows.map(({ product, total, status }) => (
                <tr
                  key={product.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setDetail(product)}
                >
                  <td className="td font-semibold text-slate-800">{product.name}</td>
                  <td className="td font-mono text-xs text-slate-500">{product.sku}</td>
                  <td className="td">{product.product_categories?.name ?? "—"}</td>
                  <td className="td">{product.uom}</td>
                  <td className="td text-right font-semibold">{fmtQty(total)}</td>
                  <td className="td text-right text-slate-400">
                    {effectiveMinQty(product.reorder_rules)}
                  </td>
                  <td className="td">
                    <span
                      className={`badge ${
                        status === "in"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : status === "low"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-rose-200 bg-rose-50 text-rose-700"
                      }`}
                    >
                      {status === "in" ? "In stock" : status === "low" ? "Low stock" : "Out of stock"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateProduct
          categories={categories}
          locations={locations}
          onClose={() => setShowCreate(false)}
          onCreated={fetchAll}
        />
      )}
      {detail && (
        <ProductDetail
          product={detail}
          categories={categories}
          quants={quants.filter((q) => q.product_id === detail.id)}
          onClose={() => setDetail(null)}
          onChanged={fetchAll}
        />
      )}
    </AppShell>
  );
}

function CreateProduct({
  categories,
  locations,
  onClose,
  onCreated,
}: {
  categories: Category[];
  locations: Location[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [uom, setUom] = useState("Units");
  const [initialQty, setInitialQty] = useState("");
  const [initialLoc, setInitialLoc] = useState("");
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { data: prod, error: pErr } = await supabase
      .from("products")
      .insert({
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        category_id: categoryId || null,
        uom,
      })
      .select()
      .single();
    if (pErr || !prod) {
      setError(pErr?.message ?? "Could not create product");
      setBusy(false);
      return;
    }
    const qty = Number(initialQty);
    if (initialQty && qty > 0 && initialLoc) {
      await supabase.rpc("apply_stock_move", {
        p_move_type: "incoming",
        p_product_id: prod.id,
        p_quantity: qty,
        p_reference: "Initial stock",
        p_reference_id: prod.id,
        p_source_location_id: null,
        p_destination_location_id: initialLoc,
      });
    }
    if (minQty && Number(minQty) > 0) {
      const { error: rrErr } = await supabase.from("reorder_rules").insert({
        product_id: prod.id,
        min_qty: Number(minQty),
        max_qty: maxQty ? Number(maxQty) : null,
      });
      if (rrErr) {
        setError(`Product created, but the reordering rule failed: ${rrErr.message}`);
        setBusy(false);
        onCreated();
        return;
      }
    }
    setBusy(false);
    onClose();
    onCreated();
  }

  return (
    <Modal title="New product" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Name *</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Steel Rods" />
          </div>
          <div>
            <label className="label">SKU / Code *</label>
            <input className="input" required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SR-001" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Unit of Measure</label>
            <select className="input" value={uom} onChange={(e) => setUom(e.target.value)}>
              {UOMS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Initial stock (optional)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Quantity</label>
              <input className="input" type="number" min="0" step="any" value={initialQty} onChange={(e) => setInitialQty(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Location</label>
              <select className="input" value={initialLoc} onChange={(e) => setInitialLoc(e.target.value)}>
                <option value="">—</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {(l as unknown as { warehouses?: { name: string } }).warehouses?.name} / {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Reordering rule (optional — defaults to {DEFAULT_MIN_STOCK} for low-stock alert)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min quantity</label>
              <input className="input" type="number" min="0" step="any" value={minQty} onChange={(e) => setMinQty(e.target.value)} placeholder="Trigger low-stock alert at" />
            </div>
            <div>
              <label className="label">Max quantity</label>
              <input className="input" type="number" min="0" step="any" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create product"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ProductDetail({
  product,
  categories,
  quants,
  onClose,
  onChanged,
}: {
  product: Product;
  categories: Category[];
  quants: QuantRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku);
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");
  const [uom, setUom] = useState(product.uom);
  const [active, setActive] = useState(product.active);
  const [minQty, setMinQty] = useState(
    (Array.isArray(product.reorder_rules)
      ? product.reorder_rules[0]?.min_qty
      : product.reorder_rules?.min_qty
    )?.toString() ?? ""
  );
  const [maxQty, setMaxQty] = useState(
    (Array.isArray(product.reorder_rules)
      ? product.reorder_rules[0]?.max_qty
      : product.reorder_rules?.max_qty
    )?.toString() ?? ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: pErr } = await supabase
      .from("products")
      .update({
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        category_id: categoryId || null,
        uom,
        active,
      })
      .eq("id", product.id);
    if (pErr) {
      setError(pErr.message);
      setBusy(false);
      return;
    }
    if (minQty && Number(minQty) > 0) {
      const { error: rrErr } = await supabase.from("reorder_rules").upsert(
        {
          product_id: product.id,
          min_qty: Number(minQty),
          max_qty: maxQty ? Number(maxQty) : null,
        },
        { onConflict: "product_id" }
      );
      if (rrErr) {
        setError(`Could not save reordering rule: ${rrErr.message}`);
        setBusy(false);
        return;
      }
    } else {
      await supabase.from("reorder_rules").delete().eq("product_id", product.id);
    }
    setBusy(false);
    onChanged();
    onClose();
  }

  const total = quants.reduce((s, q) => s + Number(q.quantity), 0);

  return (
    <Modal title={`Edit product — ${product.sku}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">SKU</label>
            <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">UoM</label>
            <select className="input" value={uom} onChange={(e) => setUom(e.target.value)}>
              {UOMS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Stock availability per location
          </p>
          {quants.length === 0 ? (
            <p className="text-sm text-slate-400">No stock on hand.</p>
          ) : (
            <ul className="space-y-1">
              {quants.map((q) => {
                const loc = q.locations as QuantWithWh["locations"];
                return (
                  <li key={q.id} className="flex justify-between text-sm">
                    <span className="text-slate-600">
                      {loc?.warehouses?.name ? `${loc.warehouses.name} / ` : ""}{loc?.name ?? "?"}
                    </span>
                    <span className="font-semibold">{fmtQty(Number(q.quantity))} {product.uom}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-sm font-bold text-slate-800">
            Total on hand: {fmtQty(total)} {product.uom}
          </p>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Reordering rule
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min quantity</label>
              <input className="input" type="number" min="0" step="any" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
            </div>
            <div>
              <label className="label">Max quantity</label>
              <input className="input" type="number" min="0" step="any" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} />
            </div>
          </div>
        </div>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
