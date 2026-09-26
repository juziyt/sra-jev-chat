export type ServerId = "orders" | "identity";

/** Display name per server. */
export const SERVER_LABELS: Record<ServerId, string> = {
  orders: "Orders",
  identity: "Identity",
};
