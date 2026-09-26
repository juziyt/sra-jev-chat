import type { ShownResult } from "../shared/types.ts";

/**
 * Kinds of copilot observation Jev may pick. `wait` and `ask` are filled in with the missing
 * argument name at display time (`Waiting for order_id.`); the strings here are the Choice criteria.
 */
export const OBSERVATIONS = {
  wait_listening: "Still listening — nothing for me to do yet.",
  wait: "Waiting for a missing tool argument.",
  ask: "Ask the customer for the missing tool argument.",
  not_cs: "This doesn't look like identity, order lookup, or a refund.",
} as const;

export type ObservationId = keyof typeof OBSERVATIONS;

/** The observation shown to the service rep. `wait`/`ask` include `missing` when we have it. */
export function observationText(id: ObservationId, missing?: string): string {
  if (id === "wait" && missing) return `Waiting for ${missing}.`;
  if (id === "ask" && missing) return `Ask the customer for ${missing}.`;
  if (id === "wait" || id === "ask") return OBSERVATIONS.wait_listening;
  return OBSERVATIONS[id];
}

function identityLine(results: ShownResult[]): string | undefined {
  const r = results.find((x) => x.toolId === "identity.verify_identity");
  return r?.summary;
}

function orderLine(results: ShownResult[]): string | undefined {
  const r = results.find((x) => x.toolId === "orders.get_order");
  return r?.summary;
}

function refundLine(results: ShownResult[]): string | undefined {
  const r = results.find((x) => x.toolId === "orders.initiate_refund");
  if (!r) return undefined;
  const id = r.items[0]?.title;
  const reason = r.items[0]?.subtitle;
  const order = typeof r.args.order_id === "string" ? r.args.order_id : undefined;
  if (id && order) {
    return reason
      ? `I've opened refund request ${id} for ${order} (${reason}).`
      : `I've opened refund request ${id} for ${order}.`;
  }
  return r.summary;
}

/**
 * One customer-facing suggested reply from the newest tool results, or undefined when they
 * don't add up to something to tell the customer.
 */
export function suggestionFromResults(results: ShownResult[]): string | undefined {
  const refund = refundLine(results);
  if (refund) return refund;
  const parts = [identityLine(results), orderLine(results)].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  return parts.length ? parts.join(" ") : undefined;
}

/** Whether the newest identity result is a successful verification. */
export function identityVerified(results: ShownResult[]): boolean {
  const r = results.find((x) => x.toolId === "identity.verify_identity");
  return !!r && /\bis verified\./.test(r.summary) && !/\bis not verified\./.test(r.summary);
}

/** Whether identity was attempted and came back not verified. */
export function identityRejected(results: ShownResult[]): boolean {
  const r = results.find((x) => x.toolId === "identity.verify_identity");
  return !!r && /\bis not verified\./.test(r.summary);
}

/** Whether an order lookup is already in the results. */
export function hasOrderResult(results: ShownResult[]): boolean {
  return results.some((r) => r.toolId === "orders.get_order");
}

/** Whether a refund request is already in the results. */
export function hasRefundResult(results: ShownResult[]): boolean {
  return results.some((r) => r.toolId === "orders.initiate_refund");
}

/** Whether the looked-up order is cancelled (and so cannot be refunded). */
export function orderCancelled(results: ShownResult[]): boolean {
  const r = results.find((x) => x.toolId === "orders.get_order");
  return !!r && /\bcancelled\b/i.test(r.summary);
}
