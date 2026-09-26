"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRealtime } from "@/lib/hooks/useRealtime";
import { createClient } from "@/lib/supabase/client";
import type { Location, Warehouse } from "@/lib/types";

export default function WarehouseSettingsPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [whName, setWhName] = useState("");
  const [whCode, setWhCode] = useState("");
  const [whAddress, setWhAddress] = useState("");
  const [locByWh, setLocByWh] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    const supabase = createClient();
    const [cw, cl] = await Promise.all([
      supabase.from("warehouses").select("*").order("created_at"),
      supabase.from("locations").select("*").order("created_at"),
    ]);
    setWarehouses((cw.data as Warehouse[]) ?? []);
    setLocations((cl.data as Location[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useRealtime(["warehouses", "locations"], fetchAll);

  async function addWarehouse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!whName.trim() || !whCode.trim()) return;
    setBusy(true);
    const { error } = await createClient()
      .from("warehouses")
      .insert({
        name: whName.trim(),
        short_code: whCode.trim().toUpperCase(),
        address: whAddress.trim() || null,
      });
    setBusy(false);
    if (error) return setError(error.message);
    setWhName("");
    setWhCode("");
    setWhAddress("");
    void fetchAll();
  }

  async function addLocation(warehouseId: string) {
    const name = (locByWh[warehouseId] ?? "").trim();
    if (!name) return;
    const { error } = await createClient()
      .from("locations")
      .insert({ warehouse_id: warehouseId, name });
    if (error) return setError(error.message);
    setLocByWh((m) => ({ ...m, [warehouseId]: "" }));
    void fetchAll();
  }

  async function removeWarehouse(id: string) {
    if (!confirm("Delete this warehouse and all its locations? Stock history is kept.")) return;
    const { error } = await createClient().from("warehouses").delete().eq("id", id);
    if (error) alert(error.message);
    void fetchAll();
  }

  async function removeLocation(id: string) {
    const { error } = await createClient().from("locations").delete().eq("id", id);
    if (error) alert(error.message);
    void fetchAll();
  }

  return (
    <AppShell
      title="Warehouse Settings"
      subtitle="Multi-warehouse support — manage warehouses and their storage locations"
    >
      {error && (
        <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Add warehouse
          </h2>
          <form onSubmit={addWarehouse} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input className="input" value={whName} onChange={(e) => setWhName(e.target.value)} placeholder="Main Warehouse" required />
            </div>
            <div>
              <label className="label">Short code</label>
              <input className="input" value={whCode} onChange={(e) => setWhCode(e.target.value)} placeholder="WH" required maxLength={6} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={whAddress} onChange={(e) => setWhAddress(e.target.value)} placeholder="Optional" />
            </div>
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Adding…" : "Add warehouse"}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="card p-6 text-sm text-slate-400">Loading…</div>
          ) : warehouses.length === 0 ? (
            <div className="card p-6 text-sm text-slate-400">
              No warehouses yet. Add your first warehouse on the left — receipts, deliveries and
              transfers need at least one warehouse with a location.
            </div>
          ) : (
            warehouses.map((w) => {
              const locs = locations.filter((l) => l.warehouse_id === w.id);
              return (
                <div key={w.id} className="card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-slate-900">
                        {w.name}{" "}
                        <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
                          {w.short_code}
                        </span>
                      </p>
                      {w.address && <p className="text-xs text-slate-400">{w.address}</p>}
                    </div>
                    <button className="btn-danger !py-1 text-xs" onClick={() => void removeWarehouse(w.id)}>
                      Delete
                    </button>
                  </div>

                  <div className="mt-3">
                    <p className="label">Locations</p>
                    {locs.length === 0 ? (
                      <p className="mb-2 text-xs text-slate-400">
                        No locations — add one so stock can be stored here.
                      </p>
                    ) : (
                      <ul className="mb-2 flex flex-wrap gap-2">
                        {locs.map((l) => (
                          <li
                            key={l.id}
                            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm"
                          >
                            {l.name}
                            <button
                              onClick={() => void removeLocation(l.id)}
                              className="text-slate-400 hover:text-rose-600"
                              aria-label={`Remove ${l.name}`}
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex gap-2">
                      <input
                        className="input max-w-xs"
                        placeholder="e.g. Rack A / Cold Room"
                        value={locByWh[w.id] ?? ""}
                        onChange={(e) => setLocByWh((m) => ({ ...m, [w.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && void addLocation(w.id)}
                      />
                      <button className="btn-ghost" onClick={() => void addLocation(w.id)}>
                        + Add location
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppShell>
  );
}
