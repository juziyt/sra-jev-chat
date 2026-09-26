export const STATUSES = ["placed", "processing", "shipped", "delivered", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  status: Status;
  placedAt: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shippingCost: number;
  total: number;
  currency: "USD";
  shipTo: { city: string; region: string };
  tracking?: string;
  eta?: string;
}

/** A looked-up order plus the prose summary and a single-line destination. */
export interface OrderDetails extends Order {
  destination: string;
  text: string;
}

const ORDERS: Order[] = [
  {
    id: "ORD-1001",
    status: "shipped",
    placedAt: "2026-09-20",
    items: [{ name: "Wireless headphones", quantity: 1, price: 79 }],
    subtotal: 79,
    tax: 6.32,
    shippingCost: 5,
    total: 90.32,
    currency: "USD",
    shipTo: { city: "Denver", region: "CO" },
    tracking: "1Z999AA10123456784",
    eta: "2026-09-26",
  },
  {
    id: "ORD-1002",
    status: "delivered",
    placedAt: "2026-09-12",
    items: [{ name: "Coffee beans, 12oz", quantity: 2, price: 14 }],
    subtotal: 28,
    tax: 2.24,
    shippingCost: 0,
    total: 30.24,
    currency: "USD",
    shipTo: { city: "Portland", region: "OR" },
  },
  {
    id: "ORD-1003",
    status: "processing",
    placedAt: "2026-09-23",
    items: [
      { name: "Linen shirt", quantity: 1, price: 48 },
      { name: "Wool socks", quantity: 2, price: 12 },
    ],
    subtotal: 72,
    tax: 5.76,
    shippingCost: 4.99,
    total: 82.75,
    currency: "USD",
    shipTo: { city: "Seattle", region: "WA" },
  },
  {
    id: "ORD-1042",
    status: "cancelled",
    placedAt: "2026-09-18",
    items: [{ name: "Ceramic mug", quantity: 1, price: 14 }],
    subtotal: 14,
    tax: 1.12,
    shippingCost: 0,
    total: 15.12,
    currency: "USD",
    shipTo: { city: "Austin", region: "TX" },
  },
];

const BY_ID = new Map(ORDERS.map((o) => [o.id, o]));

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function statusLabel(status: Status): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * The catalog id for a typed order reference: strips a spoken "order" / "order id" prefix, a
 * leading `#`, and writes a bare number as `ORD-n`.
 */
export function canonicalOrderId(query: string): string {
  let s = query.trim();
  s = s.replace(/^(?:the\s+)?order(?:\s+(?:id|number))?\s+/i, "");
  s = s.replace(/^#/, "");
  s = s.replace(/\s+/g, "").toUpperCase();
  const digits = /^(?:ORD-?)?(\d+)$/.exec(s);
  return digits ? `ORD-${digits[1]}` : s;
}

function details(order: Order): OrderDetails {
  const destination = `${order.shipTo.city}, ${order.shipTo.region}`;
  const qty = order.items.reduce((n, i) => n + i.quantity, 0);
  const text = `${order.id} · ${statusLabel(order.status)} · ${qty} item${qty === 1 ? "" : "s"} · ${money(order.total)} · ${destination}`;
  return { ...order, destination, text };
}

/** The sample order for `query`, or undefined when the catalog has no match. */
export function lookupOrder(query: string): OrderDetails | undefined {
  const id = canonicalOrderId(query);
  const order = BY_ID.get(id);
  return order ? details(order) : undefined;
}

export interface RefundRequest {
  refund_id: string;
  order_id: string;
  reason: string;
  text: string;
}

const REFUNDS = new Map<string, RefundRequest>();

/**
 * Open a refund request for `orderQuery`. Returns `{ error }` when the catalog has no match, the
 * order is cancelled, or `reason` is empty. A second call for the same order returns the first
 * request (the original reason is kept).
 */
export function initiateRefund(
  orderQuery: string,
  reason: string,
): RefundRequest | { error: string } {
  const trimmed = reason.trim();
  if (!trimmed) return { error: "A refund reason is required." };
  const order = lookupOrder(orderQuery);
  if (!order) return { error: `Couldn't find an order called "${orderQuery}".` };
  if (order.status === "cancelled") {
    return { error: `${order.id} is cancelled, so it can't be refunded.` };
  }
  const existing = REFUNDS.get(order.id);
  if (existing) return existing;
  const refund_id = `REF-${order.id.replace(/^ORD-/, "")}`;
  const refund: RefundRequest = {
    refund_id,
    order_id: order.id,
    reason: trimmed,
    text: `Refund request ${refund_id} for ${order.id}.`,
  };
  REFUNDS.set(order.id, refund);
  return refund;
}
