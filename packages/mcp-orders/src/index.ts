#!/usr/bin/env node
import { defineTool, failure, serve, structured } from "@jev-chat/mcp-kit";
import { z } from "zod";

import { initiateRefund, lookupOrder, STATUSES } from "./catalog.ts";

await serve("orders", "0.1.0", (server) => {
  defineTool(
    server,
    "get_order",
    {
      title: "Order lookup",
      description: "Look up a purchase order by id: status, line items, totals and shipping.",
      inputSchema: {
        order_id: z.string().describe("Order id, e.g. 'ORD-1001', '1001', or 'order ORD-1001'"),
      },
      outputSchema: {
        id: z.string(),
        status: z.enum(STATUSES),
        placedAt: z.string(),
        items: z.array(z.object({ name: z.string(), quantity: z.number(), price: z.number() })),
        subtotal: z.number(),
        tax: z.number(),
        shippingCost: z.number(),
        total: z.number(),
        currency: z.string(),
        shipTo: z.object({ city: z.string(), region: z.string() }),
        tracking: z.string().optional(),
        eta: z.string().optional(),
        destination: z.string(),
        text: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ order_id }) => {
      const found = lookupOrder(order_id);
      if (!found) return failure(`Couldn't find an order called "${order_id}".`);
      return structured(found.text, found);
    },
  );

  defineTool(
    server,
    "initiate_refund",
    {
      title: "Initiate refund",
      description: "Open a refund request for a purchase order. Returns a refund request id.",
      inputSchema: {
        order_id: z.string().describe("Order id, e.g. 'ORD-1001', '1001', or 'order ORD-1001'"),
        reason: z.string().describe("Why the customer wants a refund"),
      },
      outputSchema: {
        refund_id: z.string(),
        order_id: z.string(),
        reason: z.string(),
        text: z.string(),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    ({ order_id, reason }) => {
      const out = initiateRefund(order_id, reason);
      if ("error" in out) return failure(out.error);
      return structured(out.text, out);
    },
  );
});
