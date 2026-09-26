"use client";

import { useMemo, useState } from "react";

export interface DocLine {
  key: string;
  product_id: string;
  quantity: number | string;
  source_location_id?: string | null;
  destination_location_id?: string | null;
}

export interface ProductOpt {
  id: string;
  sku: string;
  name: string;
  uom: string;
}

export interface LocationOpt {
  id: string;
  name: string;
  warehouse_id: string;
}

/**
 * Editable product-lines editor shared by receipts, deliveries and transfers.
 */
export default function DocLines({
  lines,
  products,
  locations,
  onChange,
  showLocations = false,
  sourceWarehouseId,
  destinationWarehouseId,
  stockByProduct,
}: {
  lines: DocLine[];
  products: ProductOpt[];
  locations: LocationOpt[];
  onChange: (lines: DocLine[]) => void;
  showLocations?: boolean;
  sourceWarehouseId?: string;
  destinationWarehouseId?: string;
  stockByProduct?: Record<string, number>;
}) {
  const [query, setQuery] = useState("");

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [products, query]);

  const srcLocs = locations.filter(
    (l) => !sourceWarehouseId || l.warehouse_id === sourceWarehouseId
  );
  const dstLocs = locations.filter(
    (l) => !destinationWarehouseId || l.warehouse_id === destinationWarehouseId
  );

  function update(key: string, patch: Partial<DocLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function remove(key: string) {
    onChange(lines.filter((l) => l.key !== key));
  }

  function addProduct(productId: string) {
    if (!productId) return;
    if (lines.some((l) => l.product_id === productId)) return;
    onChange([
      ...lines,
      { key: `${Date.now()}-${Math.random()}`, product_id: productId, quantity: 1 },
    ]);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search product or SKU…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="input max-w-xs"
          value=""
          onChange={(e) => addProduct(e.target.value)}
        >
          <option value="">+ Add product…</option>
          {filteredProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} — {p.name}
              {stockByProduct && p.id in stockByProduct
                ? ` (on hand: ${stockByProduct[p.id]})`
                : ""}
            </option>
          ))}
        </select>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
          No products added yet. Use “Add product…” above.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Product</th>
                <th className="th w-36">Quantity</th>
                {showLocations && <th className="th">From location</th>}
                {showLocations && <th className="th">To location</th>}
                <th className="th w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {lines.map((line) => {
                const p = products.find((x) => x.id === line.product_id);
                return (
                  <tr key={line.key}>
                    <td className="td">
                      <span className="font-semibold text-slate-800">{p?.name ?? "?"}</span>
                      <span className="ml-2 text-xs text-slate-400">{p?.sku}</span>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="input"
                          value={line.quantity}
                          onChange={(e) =>
                            update(line.key, { quantity: e.target.value })
                          }
                        />
                        <span className="text-xs text-slate-400">{p?.uom}</span>
                      </div>
                    </td>
                    {showLocations && (
                      <td className="td">
                        <select
                          className="input"
                          value={line.source_location_id ?? ""}
                          onChange={(e) =>
                            update(line.key, { source_location_id: e.target.value })
                          }
                        >
                          <option value="">Select…</option>
                          {srcLocs.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {showLocations && (
                      <td className="td">
                        <select
                          className="input"
                          value={line.destination_location_id ?? ""}
                          onChange={(e) =>
                            update(line.key, {
                              destination_location_id: e.target.value,
                            })
                          }
                        >
                          <option value="">Select…</option>
                          {dstLocs.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="td">
                      <button
                        onClick={() => remove(line.key)}
                        className="text-slate-400 transition hover:text-rose-600"
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
