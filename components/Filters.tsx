"use client";

import type { Category, MoveState, Warehouse } from "@/lib/types";
import { MOVE_STATES } from "@/lib/types";

export interface FilterState {
  docTypes: string[];
  states: string[];
  warehouseId: string;
  categoryId: string;
}

const DOC_LABELS: [string, string][] = [
  ["receipts", "Receipts"],
  ["deliveries", "Delivery"],
  ["transfers", "Internal"],
  ["adjustments", "Adjustments"],
];

export default function Filters({
  warehouses,
  categories,
  value,
  onChange,
}: {
  warehouses: Warehouse[];
  categories: Category[];
  value: FilterState;
  onChange: (v: FilterState) => void;
}) {
  function toggle(list: string[], item: string): string[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
      <div>
        <p className="label mb-1.5">Document type</p>
        <div className="flex flex-wrap gap-1.5">
          {DOC_LABELS.map(([key, label]) => (
            <Chip
              key={key}
              active={value.docTypes.includes(key)}
              onClick={() =>
                onChange({ ...value, docTypes: toggle(value.docTypes, key) })
              }
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="label mb-1.5">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {MOVE_STATES.map((s) => (
            <Chip
              key={s}
              active={value.states.includes(s)}
              onClick={() =>
                onChange({ ...value, states: toggle(value.states, s) })
              }
            >
              {s}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="label mb-1.5">Warehouse</p>
        <select
          className="input w-44"
          value={value.warehouseId}
          onChange={(e) => onChange({ ...value, warehouseId: e.target.value })}
        >
          <option value="">All warehouses</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="label mb-1.5">Category</p>
        <select
          className="input w-44"
          value={value.categoryId}
          onChange={(e) => onChange({ ...value, categoryId: e.target.value })}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize transition ${
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
