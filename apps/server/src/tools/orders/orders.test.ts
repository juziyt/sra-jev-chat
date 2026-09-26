import { describe, expect, it } from "vitest";

import { buildArgs, runBuild, textResult, toolResult } from "../kit/testkit.ts";
import { getOrder, initiateRefund } from "./orders.ts";

const MESSAGE = "Where is order ORD-1001?";

const details = {
  text: "ORD-1001 · Shipped · 1 item · $90.32 · Denver, CO",
  id: "ORD-1001",
  status: "shipped",
  placedAt: "2026-09-20",
  items: [{ name: "Wireless headphones", quantity: 1, price: 79 }],
  subtotal: 79,
  tax: 6.32,
  shippingCost: 5,
  total: 90.32,
  currency: "USD" as const,
  destination: "Denver, CO",
  tracking: "1Z999AA10123456784",
  eta: "2026-09-26",
};

describe("getOrder.build", () => {
  it("takes the order id from the message", () => {
    expect(
      buildArgs(getOrder, {
        message: MESSAGE,
        answers: { order_id: "ORD-1001" },
      }),
    ).toEqual({ order_id: "ORD-1001" });
  });

  it("accepts a bare number as the order id", () => {
    expect(
      buildArgs(getOrder, {
        message: "Look up order 1003",
        answers: { order_id: "1003" },
      }),
    ).toEqual({ order_id: "1003" });
  });

  it("asks for the id rather than guessing one", () => {
    const { result } = runBuild(getOrder, {
      message: "Where is my order?",
      answers: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("order_id");
  });

  it("records where the order id came from", () => {
    const { result } = runBuild(getOrder, {
      message: MESSAGE,
      answers: { order_id: "ORD-1001" },
    });
    expect(result.sources[0]).toMatchObject({
      name: "order_id",
      value: "ORD-1001",
      source: "message",
    });
  });
});

describe("getOrder.present", () => {
  it("builds an order card and exposes line items and totals for follow-ups", () => {
    const out = getOrder.present(toolResult(details), { order_id: "ORD-1001" });
    expect(out.card).toMatchObject({
      type: "order",
      orderId: "ORD-1001",
      status: "shipped",
      destination: "Denver, CO",
    });
    expect(out.text).toBe(details.text);
    expect(out.lastResult?.items.map((i) => i.title)).toEqual(["Wireless headphones"]);
    expect(out.lastResult?.numbers.map((n) => n.value)).toEqual(
      expect.arrayContaining([90.32, 79]),
    );
  });

  it("falls back to the tool's own text when the result doesn't match the expected shape", () => {
    const out = getOrder.present(textResult('Couldn\'t find an order called "ORD-9999".'), {});
    expect(out.card?.type).toBe("error");
    expect(out.text).toMatch(/ORD-9999/);
  });
});

const REFUND_MESSAGE = "Refund order ORD-1001, it arrived damaged";

describe("initiateRefund.build", () => {
  it("takes the order id and reason from the message", () => {
    expect(
      buildArgs(initiateRefund, {
        message: REFUND_MESSAGE,
        answers: { order_id: "ORD-1001", reason: "arrived damaged" },
      }),
    ).toEqual({ order_id: "ORD-1001", reason: "arrived damaged" });
  });

  it("asks for the order id rather than guessing one", () => {
    const { result } = runBuild(initiateRefund, {
      message: "Refund my order, it arrived damaged",
      answers: { reason: "arrived damaged" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("order_id");
  });

  it("asks for the reason rather than guessing one", () => {
    const { result } = runBuild(initiateRefund, {
      message: "Refund order ORD-1001",
      answers: { order_id: "ORD-1001" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("reason");
  });

  it("uses a typed pending reply as the order id or reason even when Jev picks none", () => {
    const { result } = runBuild(initiateRefund, {
      message: "ORD-1001",
      answers: {},
      partial: { __answer: "ORD-1001" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toBe("reason");
      expect(result.partial).toEqual({ order_id: "ORD-1001" });
    }
    expect(
      buildArgs(initiateRefund, {
        message: "it arrived damaged",
        answers: {},
        partial: { order_id: "ORD-1001", __answer: "it arrived damaged" },
      }),
    ).toEqual({ order_id: "ORD-1001", reason: "it arrived damaged" });
  });

  it("does not send the pending-answer hint to the tool", () => {
    expect(
      buildArgs(initiateRefund, {
        message: "arrived damaged",
        answers: {},
        partial: { order_id: "1001", __answer: "arrived damaged" },
      }),
    ).toEqual({ order_id: "1001", reason: "arrived damaged" });
  });

  it("asks for confirmation before calling", () => {
    expect(initiateRefund.confirm?.({ order_id: "ORD-1001", reason: "arrived damaged" })).toBe(
      true,
    );
  });
});

describe("initiateRefund.present", () => {
  it("shows the refund request id on an action card", () => {
    const out = initiateRefund.present(
      toolResult({
        text: "Refund request REF-1001 for ORD-1001.",
        refund_id: "REF-1001",
        order_id: "ORD-1001",
        reason: "arrived damaged",
      }),
      { order_id: "ORD-1001", reason: "arrived damaged" },
    );
    expect(out.card).toMatchObject({
      type: "action",
      title: "REF-1001",
      lines: ["Order ORD-1001", "arrived damaged"],
      ok: true,
    });
    expect(out.text).toBe("Refund request REF-1001 for ORD-1001.");
    expect(out.lastResult?.items).toEqual([{ title: "REF-1001", subtitle: "arrived damaged" }]);
  });

  it("falls back to the tool's own text when the result doesn't match the expected shape", () => {
    const out = initiateRefund.present(
      textResult("ORD-1042 is cancelled, so it can't be refunded."),
      {},
    );
    expect(out.card?.type).toBe("error");
    expect(out.text).toMatch(/cancelled/);
  });
});
