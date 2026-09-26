import { verifyIdentity } from "./identity/identity.ts";
import type { Adapter } from "./kit/adapter.ts";
import { getOrder, initiateRefund } from "./orders/orders.ts";

/** Every Adapter Jev can choose between. */
export const ADAPTERS: Adapter[] = [getOrder, initiateRefund, verifyIdentity];

/** Identity, order lookup, and refund — the tools the assist copilot may call. */
export const CS_ADAPTERS: Adapter[] = [verifyIdentity, getOrder, initiateRefund];

/** The registered adapter with this id, or undefined. */
export function adapterById(id: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}

export type {
  Adapter,
  BuildResult,
  MultiStepAdapter,
  Presented,
  RunContext,
  SingleStepAdapter,
} from "./kit/adapter.ts";
