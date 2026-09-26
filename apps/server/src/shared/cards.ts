/** A structured reply the web app renders, one variant per kind of answer. */
export type Card =
  | { type: "action"; title: string; lines: string[]; ok: boolean }
  | {
      type: "confirm";
      title: string;
      tool: string;
      args: { name: string; value: string }[];
      confirmLabel: string;
      destructive: boolean;
    }
  | { type: "choices"; options: { value: string; label: string; description?: string }[] }
  | { type: "capabilities"; servers: { label: string; examples: string[]; connected: boolean }[] }
  | {
      type: "order";
      orderId: string;
      status: string;
      placedAt: string;
      items: { name: string; quantity: number; price: number }[];
      subtotal: number;
      tax: number;
      shippingCost: number;
      total: number;
      currency: string;
      destination: string;
      tracking?: string;
      eta?: string;
    }
  | { type: "error"; message: string }
  | { type: "suggestion"; text: string }
  | { type: "bundle"; cards: Card[] };

export type CardType = Card["type"];
