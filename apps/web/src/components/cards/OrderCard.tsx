import { keyed } from "../ui/keyed.ts";
import type { CardComponent } from "./types.ts";

function money(currency: string, n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusClass(status: string): string {
  switch (status) {
    case "delivered":
      return "badge-success";
    case "shipped":
      return "badge-info";
    case "cancelled":
      return "badge-error";
    default:
      return "badge-warning";
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** A purchase order: status, destination, line items and totals. */
export const OrderCard: CardComponent<"order"> = ({ card }) => (
  <div className="overflow-hidden rounded-box border border-base-300 bg-base-200">
    <div className="flex flex-wrap items-start justify-between gap-2 p-3">
      <div>
        <div className="font-mono text-lg font-bold">{card.orderId}</div>
        <div className="text-sm text-base-content/70">
          Placed {formatDate(card.placedAt)} · {card.destination}
        </div>
      </div>
      <span className={`badge ${statusClass(card.status)}`}>{statusLabel(card.status)}</span>
    </div>
    {(card.tracking || card.eta) && (
      <div className="border-t border-base-300 px-3 py-2 text-sm">
        {card.tracking && (
          <div>
            Tracking <span className="font-mono">{card.tracking}</span>
          </div>
        )}
        {card.eta && <div>Arrives {formatDate(card.eta)}</div>}
      </div>
    )}
    <table className="table table-sm">
      <thead>
        <tr>
          <th>Item</th>
          <th className="text-right">Qty</th>
          <th className="text-right">Price</th>
        </tr>
      </thead>
      <tbody>
        {keyed(card.items, (i) => i.name).map(({ key, item }) => (
          <tr key={key}>
            <td>{item.name}</td>
            <td className="text-right">{item.quantity}</td>
            <td className="text-right">{money(card.currency, item.price)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="space-y-0.5 border-t border-base-300 p-3 text-sm">
      <div className="flex justify-between">
        <span className="text-base-content/60">Subtotal</span>
        <span>{money(card.currency, card.subtotal)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-base-content/60">Tax</span>
        <span>{money(card.currency, card.tax)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-base-content/60">Shipping</span>
        <span>{money(card.currency, card.shippingCost)}</span>
      </div>
      <div className="flex justify-between font-semibold">
        <span>Total</span>
        <span>{money(card.currency, card.total)}</span>
      </div>
    </div>
  </div>
);
