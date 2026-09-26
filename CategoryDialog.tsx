"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CategoryDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    await supabase
      .from("product_categories")
      .insert({ name: name.trim() })
      .select()
      .single();
    setBusy(false);
    setName("");
    setOpen(false);
    onCreated();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost">
        + Category
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="card w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-base font-bold text-slate-900">New category</h3>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void create()}
              placeholder="e.g. Raw Materials"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={busy || !name.trim()} onClick={() => void create()}>
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
