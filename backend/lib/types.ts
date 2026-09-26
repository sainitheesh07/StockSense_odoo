export type MoveState =
  | "draft"
  | "waiting"
  | "ready"
  | "done"
  | "canceled";

export type MoveType = "incoming" | "outgoing" | "internal";

export type Uom =
  | "Units"
  | "kg"
  | "g"
  | "L"
  | "m"
  | "Box"
  | "Pallet"
  | "Dozen"
  | "Pair";

export const MOVE_STATES: MoveState[] = [
  "draft",
  "waiting",
  "ready",
  "done",
  "canceled",
];
export const UOMS: Uom[] = [
  "Units",
  "kg",
  "g",
  "L",
  "m",
  "Box",
  "Pallet",
  "Dozen",
  "Pair",
];
export const DOC_TYPES = [
  "receipts",
  "deliveries",
  "transfers",
  "adjustments",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export interface Warehouse {
  id: string;
  name: string;
  short_code: string;
  address: string | null;
}

export interface Location {
  id: string;
  warehouse_id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface ReorderRule {
  id: string;
  product_id: string;
  min_qty: number;
  max_qty: number | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category_id: string | null;
  uom: string;
  active: boolean;
  created_at: string;
  product_categories?: { name: string } | null;
  /** one-to-one embed: PostgREST returns an object (or null), not an array */
  reorder_rules?: ReorderRule[] | ReorderRule | null;
  stock_quant?: { quantity: number; location_id: string }[];
}

/** Default low-stock threshold when a product has no explicit reordering rule. */
export const DEFAULT_MIN_STOCK = 10;

/** Effective minimum-stock threshold for a product (rule wins, else default 10). */
export function effectiveMinQty(rule: ReorderRule[] | ReorderRule | null | undefined): number {
  const r = Array.isArray(rule) ? rule[0] : rule;
  if (r && Number(r.min_qty) > 0) return Number(r.min_qty);
  return DEFAULT_MIN_STOCK;
}

/** Total on-hand quantity across all locations for embedded stock_quant rows. */
export function totalOnHand(quants: { quantity: number }[] | null | undefined): number {
  return (quants ?? []).reduce((s, q) => s + Number(q.quantity), 0);
}

export interface QuantRow {
  id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  locations?: { name: string; warehouse_id: string } | null;
}

export interface StockMove {
  id: string;
  move_type: MoveType;
  state: MoveState;
  product_id: string;
  source_location_id: string | null;
  destination_location_id: string | null;
  quantity: number;
  reference: string | null;
  reference_id: string | null;
  occurred_at: string;
  products?: { name: string; sku: string; uom: string } | null;
  locations?: { name: string } | null;
}

export interface Receipt {
  id: string;
  name: string;
  supplier: string | null;
  warehouse_id: string;
  state: MoveState;
  created_by: string | null;
  scheduled_date: string | null;
  created_at: string;
  validated_at: string | null;
  warehouses?: { name: string; short_code: string } | null;
  receipt_lines?: ReceiptLine[] | null;
}

export interface ReceiptLine {
  id: string;
  receipt_id: string;
  product_id: string;
  quantity: number;
  products?: { name: string; sku: string; uom: string } | null;
}

export interface Delivery {
  id: string;
  name: string;
  customer: string | null;
  warehouse_id: string;
  state: MoveState;
  picked_at: string | null;
  packed_at: string | null;
  created_by: string | null;
  scheduled_date: string | null;
  created_at: string;
  validated_at: string | null;
  warehouses?: { name: string; short_code: string } | null;
  delivery_lines?: DeliveryLine[] | null;
}

export interface DeliveryLine {
  id: string;
  delivery_id: string;
  product_id: string;
  quantity: number;
  products?: { name: string; sku: string; uom: string } | null;
}

export interface Transfer {
  id: string;
  name: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  state: MoveState;
  created_by: string | null;
  scheduled_date: string | null;
  created_at: string;
  validated_at: string | null;
  transfers_source_warehouse_id_fkey?: { name: string; short_code: string } | null;
  transfers_destination_warehouse_id_fkey?: { name: string; short_code: string } | null;
  transfer_lines?: TransferLine[] | null;
}

export interface TransferLine {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  source_location_id: string | null;
  destination_location_id: string | null;
  products?: { name: string; sku: string; uom: string } | null;
}

export interface Adjustment {
  id: string;
  name: string;
  warehouse_id: string;
  state: MoveState;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  validated_at: string | null;
  warehouses?: { name: string; short_code: string } | null;
}

export interface DashboardCounts {
  total_products_in_stock: number;
  low_stock: number;
  out_of_stock: number;
  pending_receipts: number;
  pending_deliveries: number;
  pending_transfers: number;
}

export interface TrendPoint {
  day: string;
  incoming: number;
  outgoing: number;
}

export function stateBadgeClass(state: MoveState): string {
  switch (state) {
    case "draft":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "waiting":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "ready":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "done":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "canceled":
      return "bg-rose-50 text-rose-700 border-rose-200";
  }
}

export function fmtQty(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(3)));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
