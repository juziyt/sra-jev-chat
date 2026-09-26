import { z } from "zod";

import type { Candidate } from "../../jev/pools.ts";
import { candidateQ } from "../../jev/questions.ts";
import { rawFallback, readResult, type SingleStepAdapter } from "../kit/adapter.ts";
import { Args } from "../kit/args.ts";

const orderItem = z.object({
  name: z.string(),
  quantity: z.number(),
  price: z.number(),
});

const orderResult = z.object({
  text: z.string(),
  id: z.string(),
  status: z.string(),
  placedAt: z.string(),
  items: z.array(orderItem),
  subtotal: z.number(),
  tax: z.number(),
  shippingCost: z.number(),
  total: z.number(),
  currency: z.literal("USD"),
  destination: z.string(),
  tracking: z.string().optional(),
  eta: z.string().optional(),
});

export const getOrder: SingleStepAdapter = {
  id: "orders.get_order",
  server: "orders",
  mcpName: "get_order",
  label: "Order lookup",
  description:
    "Look up a store purchase / order by its order id: status, items, totals and shipping",
  examples: ["Where is order ORD-1001?", "Look up order 1003"],
  questions: (p) => ({
    order_id: candidateQ(
      "For an order lookup: which order id does the user want the details for? If they don't name one, pick the id from the earlier request.",
      p.text,
      "No order id is mentioned anywhere",
    ),
  }),
  build(a, p) {
    const args = new Args(a);
    args.pick("order_id", p.text);
    return args.require("order_id", "Which order id should I look up?");
  },
  present(result) {
    const o = readResult(result, orderResult, "get_order");
    if (!o) return rawFallback(result);
    const { text, id, ...fields } = o;
    return {
      text,
      card: { type: "order", orderId: id, ...fields },
      lastResult: {
        summary: text,
        items: o.items.map((i) => ({
          title: i.name,
          subtitle: `${i.quantity} × $${i.price.toFixed(2)}`,
        })),
        numbers: [
          { value: o.total, label: `order ${id} total` },
          { value: o.subtotal, label: `order ${id} subtotal` },
          ...o.items.map((i) => ({ value: i.price, label: `${i.name} unit price` })),
        ],
      },
    };
  },
};

const ORDER_ID_SHAPE = /^(?:(?:the\s+)?order(?:\s+(?:id|number))?\s+)?#?(?:ord-?)?\d+$/i;

function looksLikeOrderId(value: string): boolean {
  return ORDER_ID_SHAPE.test(value.trim());
}

function reasons(pool: Candidate[]): Candidate[] {
  return pool.filter((c) => !looksLikeOrderId(c.value));
}

/** Put a typed pending reply into `order_id` or `reason` by shape, without overwriting a Jev pick. */
function takeAnswer(args: Args, text: string) {
  const value = text.trim();
  if (!value) return;
  if (looksLikeOrderId(value)) {
    if (!args.has("order_id")) args.set("order_id", value, "message");
  } else if (!args.has("reason")) {
    args.set("reason", value, "message");
  }
}

const refundResult = z.object({
  text: z.string(),
  refund_id: z.string(),
  order_id: z.string(),
  reason: z.string(),
});

export const initiateRefund: SingleStepAdapter = {
  id: "orders.initiate_refund",
  server: "orders",
  mcpName: "initiate_refund",
  label: "Initiate refund",
  description:
    "Open a refund request for a store purchase / order: needs the order id and a reason, returns a refund request id (not looking up status, not cancelling)",
  examples: ["Refund order ORD-1001, it arrived damaged"],
  questions: (p) => ({
    order_id: candidateQ(
      "For a refund: which order id should be refunded? If they don't name one, pick the id from the earlier request.",
      p.text,
      "No order id is mentioned anywhere",
    ),
    reason: candidateQ(
      "For a refund: which phrase is the reason for the refund?",
      reasons(p.text),
      "No refund reason is mentioned",
    ),
  }),
  build(a, p, partial = {}) {
    const { __answer, ...kept } = partial;
    const args = new Args(a, kept);
    args.pick("order_id", p.text);
    args.pick("reason", reasons(p.text));
    if (typeof __answer === "string") takeAnswer(args, __answer);
    if (!args.has("order_id")) return args.missing("order_id", "Which order should I refund?");
    if (!args.has("reason")) return args.missing("reason", "What's the reason for the refund?");
    return args.ok();
  },
  confirm: () => true,
  confirmLabel: "Request refund",
  present(result) {
    const r = readResult(result, refundResult, "initiate_refund");
    if (!r) return rawFallback(result);
    return {
      text: r.text,
      card: {
        type: "action",
        title: r.refund_id,
        lines: [`Order ${r.order_id}`, r.reason],
        ok: true,
      },
      lastResult: {
        summary: r.text,
        items: [{ title: r.refund_id, subtitle: r.reason }],
        numbers: [],
      },
    };
  },
};
