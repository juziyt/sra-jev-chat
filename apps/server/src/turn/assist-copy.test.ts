import { describe, expect, it } from "vitest";

import type { ShownResult } from "../shared/types.ts";
import {
  identityRejected,
  identityVerified,
  observationText,
  suggestionFromResults,
} from "./assist-copy.ts";

function result(
  partial: Partial<ShownResult> & Pick<ShownResult, "toolId" | "summary">,
): ShownResult {
  return { label: partial.toolId, args: {}, items: [], numbers: [], ...partial };
}

describe("observationText", () => {
  it("fills wait and ask from the missing argument name", () => {
    expect(observationText("wait", "order_id")).toBe("Waiting for order_id.");
    expect(observationText("wait", "reason")).toBe("Waiting for reason.");
    expect(observationText("ask", "name")).toBe("Ask the customer for name.");
    expect(observationText("ask", "name and email")).toBe("Ask the customer for name and email.");
  });

  it("falls back to still-listening when wait/ask have no missing argument", () => {
    expect(observationText("wait")).toBe("Still listening — nothing for me to do yet.");
    expect(observationText("ask")).toBe("Still listening — nothing for me to do yet.");
  });

  it("leaves the other kinds as fixed sentences", () => {
    expect(observationText("wait_listening")).toBe("Still listening — nothing for me to do yet.");
    expect(observationText("not_cs")).toMatch(/doesn't look like/);
  });
});

describe("suggestionFromResults", () => {
  it("combines identity and order summaries", () => {
    expect(
      suggestionFromResults([
        result({
          toolId: "orders.get_order",
          summary: "ORD-1001 · Shipped · 1 item · $90.32 · Denver, CO",
        }),
        result({
          toolId: "identity.verify_identity",
          summary: "Jane Smith (jane.smith@example.com) is verified.",
        }),
      ]),
    ).toBe(
      "Jane Smith (jane.smith@example.com) is verified. ORD-1001 · Shipped · 1 item · $90.32 · Denver, CO",
    );
  });

  it("prefers a refund line when a refund result is present", () => {
    expect(
      suggestionFromResults([
        result({
          toolId: "orders.initiate_refund",
          summary: "Refund request REF-1001 for ORD-1001.",
          args: { order_id: "ORD-1001", reason: "arrived damaged" },
          items: [{ title: "REF-1001", subtitle: "arrived damaged" }],
        }),
      ]),
    ).toBe("I've opened refund request REF-1001 for ORD-1001 (arrived damaged).");
  });
});

describe("identityVerified", () => {
  it("reads verified vs not from the catalog summary", () => {
    expect(
      identityVerified([
        result({
          toolId: "identity.verify_identity",
          summary: "Jane Smith (jane.smith@example.com) is verified.",
        }),
      ]),
    ).toBe(true);
    expect(
      identityRejected([
        result({
          toolId: "identity.verify_identity",
          summary: "Jane Smith (other@example.com) is not verified.",
        }),
      ]),
    ).toBe(true);
    expect(identityVerified([])).toBe(false);
  });
});
