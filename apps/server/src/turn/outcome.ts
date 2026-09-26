import type { Card, ConversationState, Trace } from "../shared/types.ts";

export interface TurnOutput {
  text: string;
  card?: Card;
  trace: Trace;
  state: ConversationState;
  /** The message the turn actually handled (after spelling and follow-up rewrites) */
  message?: string;
  /** Assist: no assistant bubble; the left-pane line is stored alone. */
  silent?: boolean;
}

/** A finished reply that hasn't been timed yet; the top of the turn stamps `totalMs` on it. */
export type UntimedTurn = Omit<TurnOutput, "trace"> & { trace: Omit<Trace, "totalMs"> };
