import type { EntryType } from "@typesafe-ai/sdk";

import { HISTORY_FOR_TURN, LEFT_FOR_TURN } from "../config.ts";
import type { Pools } from "../jev/pools.ts";
import { choiceQ, safeKey, type BuiltQuestion } from "../jev/questions.ts";
import { SERVER_LABELS, type ConversationState, type Pending } from "../shared/types.ts";
import { ADAPTERS, type Adapter } from "../tools/index.ts";
import { OBSERVATIONS } from "./assist-copy.ts";

/** Options for the `request_kind` question: what the latest message is doing. */
export const REQUEST_KINDS = {
  new_request: "A new request for something the assistant can look up or do",
  answers_pending: "Answers the question the assistant just asked (see pending)",
  confirm_yes: "Says yes / go ahead to the confirmation the assistant is waiting on",
  cancel: "Says no, cancel, never mind, or stop",
  chat: "Greeting, thanks, small talk, or asks what the assistant can do",
  unsupported:
    "Asks for something none of the assistant's tools can do (e.g. book flights, write a poem)",
};

/** What the assist copilot should do after a left-pane line. */
export const COPILOT_MOVES = {
  silent:
    "Stay silent — no message on the right, no tool. Not when a required argument is still missing.",
  observe: "Tell the service rep a canned observation, without calling a tool",
  use_tool: "Call a customer-service tool (identity, order lookup, or refund)",
};

/** What the assistant is waiting on, phrased so Jev can tell an answer from a new request. */
export function describePending(p: Pending): string {
  if (p.type === "confirm") return `Waiting for the user to confirm: ${p.prompt}`;
  if (p.type === "ask") return `The assistant asked: "${p.prompt}" (about "${p.message}")`;
  return `The assistant asked the user to choose: ${p.prompt}`;
}

function resultFields(state: ConversationState): Record<string, unknown> {
  const [newest, ...earlier] = state.results ?? [];
  return {
    ...(newest
      ? {
          shown_results: {
            from: newest.label,
            summary: newest.summary,
            items: newest.items.map(
              (it, i) => `#${i + 1}: ${it.title}${it.subtitle ? ` — ${it.subtitle}` : ""}`,
            ),
            numbers: newest.numbers.map((n) => `${n.value} (${n.label})`),
          },
        }
      : {}),
    ...(earlier.length ? { earlier_results: earlier.map((r) => `${r.label}: ${r.summary}`) } : {}),
    ...(state.pending ? { pending: describePending(state.pending) } : {}),
  };
}

/** The conversation as Jev sees it: the latest message plus just enough of what came before. */
export function describeState(message: string, state: ConversationState): EntryType {
  return {
    policy:
      "For an order refund: first verify identity with verify_identity, then look up the order with get_order, then open the refund with initiate_refund.",
    latest_message: message,
    conversation: state.recent.slice(-HISTORY_FOR_TURN),
    ...resultFields(state),
  };
}

/**
 * Assist copilot state: the left-pane customer/service-rep transcript, tool results, and a
 * pending confirm/ask on the right. Observations and copilot chit-chat are omitted.
 */
export function describeAssistState(message: string, state: ConversationState): EntryType {
  const left = (state.left ?? []).slice(-LEFT_FOR_TURN);
  return {
    policy:
      "You are a back-office assistant watching a live customer / service-rep conversation. For a refund, first verify identity (full name and email), then look up the order, then open the refund. Ask for whatever identity, order id, or refund reason is still missing. Stay silent only when there is nothing to collect. Never invent wording.",
    latest_message: message,
    service_conversation: left.map(
      (l) => `${l.speaker === "customer" ? "Customer" : "Service rep"}: ${l.text}`,
    ),
    ...resultFields(state),
  };
}

export interface BuiltRequest {
  questions: Record<string, BuiltQuestion>;
  /** The option key each tool was offered under, so an answer maps back to its adapter. */
  toolKeys: Map<string, Adapter>;
}

function toolQuestions(pools: Pools, adapters: Adapter[]): BuiltRequest {
  const toolKeys = new Map<string, Adapter>();
  const toolOptions: Record<string, string> = {};
  for (const a of adapters) {
    const key = safeKey(a.id);
    toolKeys.set(key, a);
    toolOptions[key] = `${SERVER_LABELS[a.server]}: ${a.description}`;
  }
  toolOptions.none = "None of these tools (chat, or something unsupported)";
  const questions: Record<string, BuiltQuestion> = {
    tool: {
      ...choiceQ(
        "Which tool would fulfil the user's latest request (taking the conversation into account)?",
        toolOptions,
      ),
      labels: Object.fromEntries(
        Object.keys(toolOptions).map((k) => [k, toolKeys.get(k)?.id ?? k]),
      ),
    },
  };
  for (const a of adapters) {
    const prefix = safeKey(a.id);
    for (const [name, q] of Object.entries(a.questions(pools))) questions[`${prefix}__${name}`] = q;
  }
  return { questions, toolKeys };
}

/**
 * The questions for a turn's main Jev request: what kind of message this is, which tool fits, and
 * every tool's argument questions, keyed `<safeKey(tool id)>__<name>`.
 */
export function buildRequest(pools: Pools, adapters: Adapter[] = ADAPTERS): BuiltRequest {
  const tools = toolQuestions(pools, adapters);
  return {
    questions: {
      request_kind: choiceQ("What is the latest message doing?", REQUEST_KINDS),
      ...tools.questions,
    },
    toolKeys: tools.toolKeys,
  };
}

/**
 * Questions for an unprompted assist turn: silent / observe / tool, plus CS argument questions.
 */
export function buildAssistRequest(pools: Pools, adapters: Adapter[]): BuiltRequest {
  const tools = toolQuestions(pools, adapters);
  return {
    questions: {
      copilot_move: choiceQ(
        "What should the back-office assistant do about the latest service conversation?",
        COPILOT_MOVES,
      ),
      observation: choiceQ(
        "If observing (not calling a tool), which kind of note should the service rep see? For wait/ask, code fills in the missing argument name.",
        OBSERVATIONS,
      ),
      ...tools.questions,
    },
    toolKeys: tools.toolKeys,
  };
}
