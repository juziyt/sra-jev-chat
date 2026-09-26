import { describe, expect, it } from "vitest";

import { canonicalOrderId, initiateRefund, lookupOrder } from "./catalog.ts";

describe("canonicalOrderId", () => {
  it("accepts the catalog form, a bare number, and a spoken prefix", () => {
    expect(canonicalOrderId("ORD-1001")).toBe("ORD-1001");
    expect(canonicalOrderId("ord-1001")).toBe("ORD-1001");
    expect(canonicalOrderId("1001")).toBe("ORD-1001");
    expect(canonicalOrderId("#1001")).toBe("ORD-1001");
    expect(canonicalOrderId("order 1001")).toBe("ORD-1001");
    expect(canonicalOrderId("order #1001")).toBe("ORD-1001");
    expect(canonicalOrderId("the order id ORD-1001")).toBe("ORD-1001");
    expect(canonicalOrderId("order ORD-1001")).toBe("ORD-1001");
    expect(canonicalOrderId("ORD1001")).toBe("ORD-1001");
  });

  it("leaves a non-id phrase alone after trimming", () => {
    expect(canonicalOrderId("  headphones  ")).toBe("HEADPHONES");
  });
});

describe("lookupOrder", () => {
  it("returns the order, a destination line, and a summary", () => {
    expect(lookupOrder("ORD-1001")).toMatchObject({
      id: "ORD-1001",
      status: "shipped",
      destination: "Denver, CO",
      tracking: "1Z999AA10123456784",
      text: "ORD-1001 · Shipped · 1 item · $90.32 · Denver, CO",
    });
  });

  it("finds an order from a bare number or a longer phrase", () => {
    expect(lookupOrder("1003")?.id).toBe("ORD-1003");
    expect(lookupOrder("order ORD-1042")?.status).toBe("cancelled");
  });

  it("returns nothing when the catalog has no match", () => {
    expect(lookupOrder("ORD-9999")).toBeUndefined();
    expect(lookupOrder("headphones")).toBeUndefined();
  });
});

describe("initiateRefund", () => {
  it("opens a refund request and returns its id", () => {
    expect(initiateRefund("ORD-1001", "  arrived damaged  ")).toEqual({
      refund_id: "REF-1001",
      order_id: "ORD-1001",
      reason: "arrived damaged",
      text: "Refund request REF-1001 for ORD-1001.",
    });
  });

  it("returns the same request if that order already has one", () => {
    const first = initiateRefund("ORD-1002", "changed my mind");
    const second = initiateRefund("order 1002", "too late");
    expect(second).toEqual(first);
    expect(first).toMatchObject({ refund_id: "REF-1002", reason: "changed my mind" });
  });

  it("refuses a cancelled order, an unknown id, and an empty reason", () => {
    expect(initiateRefund("ORD-1042", "changed my mind")).toEqual({
      error: "ORD-1042 is cancelled, so it can't be refunded.",
    });
    expect(initiateRefund("ORD-9999", "damaged")).toEqual({
      error: 'Couldn\'t find an order called "ORD-9999".',
    });
    expect(initiateRefund("ORD-1003", "   ")).toEqual({ error: "A refund reason is required." });
  });
});
