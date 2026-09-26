import type { Card } from "@jev-chat/server/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrderCard } from "./OrderCard.tsx";

type Order = Extract<Card, { type: "order" }>;

function render(over: Partial<Order> = {}): string {
  return renderToStaticMarkup(
    <OrderCard
      card={{
        type: "order",
        orderId: "ORD-1001",
        status: "shipped",
        placedAt: "2026-09-20",
        items: [{ name: "Wireless headphones", quantity: 1, price: 79 }],
        subtotal: 79,
        tax: 6.32,
        shippingCost: 5,
        total: 90.32,
        currency: "USD",
        destination: "Denver, CO",
        tracking: "1Z999AA10123456784",
        eta: "2026-09-26",
        ...over,
      }}
      interactive={false}
      busy={false}
      onAction={() => {}}
    />,
  );
}

describe("OrderCard", () => {
  it("shows the id, status, destination, tracking and totals", () => {
    const html = render();
    expect(html).toContain("ORD-1001");
    expect(html).toContain("Shipped");
    expect(html).toContain("Denver, CO");
    expect(html).toContain("1Z999AA10123456784");
    expect(html).toContain("Wireless headphones");
    expect(html).toContain("$90.32");
  });

  it("uses an error badge for a cancelled order and hides tracking when absent", () => {
    const html = render({
      status: "cancelled",
      tracking: undefined,
      eta: undefined,
    });
    expect(html).toContain("badge-error");
    expect(html).toContain("Cancelled");
    expect(html).not.toContain("Tracking");
    expect(html).not.toContain("Arrives");
  });
});
