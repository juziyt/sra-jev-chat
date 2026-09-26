import { LEFT_KEPT } from "../config.ts";
import { askJev, jevConfigured } from "../jev/client.ts";
import { buildPools, type Pools } from "../jev/pools.ts";
import { Answers, safeKey } from "../jev/questions.ts";
import {
  SERVER_LABELS,
  type ArgTrace,
  type Card,
  type ConversationState,
  type JevAnswerJson,
} from "../shared/types.ts";
import { CS_ADAPTERS, type Adapter } from "../tools/index.ts";
import {
  hasOrderResult,
  hasRefundResult,
  identityRejected,
  identityVerified,
  OBSERVATIONS,
  observationText,
  orderCancelled,
  suggestionFromResults,
  type ObservationId,
} from "./assist-copy.ts";
import { describeArgs, execute, isDestructive } from "./execute.ts";
import type { TurnOutput, UntimedTurn } from "./outcome.ts";
import { buildAssistRequest, describeAssistState } from "./request.ts";
import { handleTurn, type TurnOptions } from "./turn.ts";

/** A left-pane line or a right-pane copilot message / button. */
export type AssistInput =
  | { kind: "left"; speaker: "customer" | "service_rep"; text: string }
  | { kind: "right"; text: string; spellcheck?: boolean }
  | { kind: "action"; type: "confirm" | "cancel" }
  | { kind: "action"; type: "pick"; value: string };

function leftBlob(state: ConversationState): string {
  return (state.left ?? []).map((l) => l.text).join("\n");
}

/** Append a left-pane line, capping how many we keep. */
export function withLeftLine(
  state: ConversationState,
  speaker: "customer" | "service_rep",
  text: string,
): ConversationState {
  return {
    ...state,
    left: [...(state.left ?? []), { speaker, text }].slice(-LEFT_KEPT),
  };
}

function assistOpts(state: ConversationState, latest: string): TurnOptions {
  return {
    adapters: CS_ADAPTERS,
    describe: describeAssistState,
    poolText: [leftBlob(state), latest].filter(Boolean).join("\n"),
  };
}

function pack(
  parts: { text: string; card?: Card }[],
  suggestion: string | undefined,
): { text: string; card?: Card } {
  const texts = parts.map((p) => p.text).filter(Boolean);
  const cards = parts.flatMap((p) => (p.card ? [p.card] : []));
  if (suggestion) cards.push({ type: "suggestion", text: suggestion });
  const text = texts.join("\n\n");
  if (cards.length === 0) return { text };
  if (cards.length === 1) return { text, card: cards[0] };
  return { text, card: { type: "bundle", cards } };
}

function csAdapter(id: string): Adapter | undefined {
  return CS_ADAPTERS.find((a) => a.id === id);
}

function nextInPipeline(state: ConversationState): Adapter | undefined {
  const results = state.results ?? [];
  if (identityRejected(results)) return undefined;
  if (!identityVerified(results) && !results.some((r) => r.toolId === "identity.verify_identity")) {
    return csAdapter("identity.verify_identity");
  }
  if (!identityVerified(results)) return undefined;
  if (!hasOrderResult(results)) return csAdapter("orders.get_order");
  if (orderCancelled(results) || hasRefundResult(results)) return undefined;
  return csAdapter("orders.initiate_refund");
}

function timed(started: number, out: UntimedTurn): TurnOutput {
  return { ...out, trace: { ...out.trace, totalMs: Math.round(performance.now() - started) } };
}

function firstMissingArg(
  state: ConversationState,
  answers: Record<string, JevAnswerJson>,
  pools: Pools,
): string | undefined {
  const adapter = nextInPipeline(state);
  if (!adapter) return undefined;
  const built = adapter.build(new Answers(answers, safeKey(adapter.id), new Set()), pools);
  return built.ok ? undefined : built.missing;
}

function observeReply(
  state: ConversationState,
  id: ObservationId,
  base: Pick<UntimedTurn["trace"], "jev" | "optionLabels" | "args">,
  missing?: string,
): UntimedTurn {
  return {
    text: observationText(id, missing),
    state,
    trace: {
      ...base,
      usedQuestions: ["copilot_move", "observation"],
      decision: { outcome: "observe", reason: `Observation: ${id}` },
    },
  };
}

/**
 * One assist turn: observe the left pane, honor a right-pane ask, or resume a confirm/pick.
 * Unprompted left turns may chain identity → order lookup → refund confirm when the inputs are ready.
 */
export async function handleAssistTurn(
  input: AssistInput,
  state: ConversationState,
): Promise<TurnOutput> {
  if (input.kind === "action") {
    return handleTurn(input, state, assistOpts(state, ""));
  }
  if (input.kind === "right") {
    return handleTurn(
      { kind: "message", text: input.text, spellcheck: input.spellcheck },
      state,
      assistOpts(state, input.text),
    );
  }
  return handleAssistLeft(input.speaker, input.text, state);
}

async function handleAssistLeft(
  speaker: "customer" | "service_rep",
  text: string,
  prior: ConversationState,
): Promise<TurnOutput> {
  const started = performance.now();
  const state = withLeftLine(prior, speaker, text);

  if (state.pending) {
    return timed(started, {
      text: "",
      silent: true,
      state,
      trace: {
        usedQuestions: [],
        decision: {
          outcome: "silent",
          reason: "Left pane updated while the right pane is waiting on the service rep",
        },
      },
    });
  }

  const pools = buildPools(leftBlob(state), state);
  const { questions } = buildAssistRequest(pools, CS_ADAPTERS);
  const answer = await askJev(describeAssistState(text, state), questions);
  const base = { jev: answer.trace, optionLabels: answer.optionLabels };

  if (!answer.ok) {
    const configured = jevConfigured();
    return timed(started, {
      text: configured
        ? `Jev request failed: ${answer.error}`
        : "Jev isn't configured yet. Set TYPESAFE_API_KEY in .env and restart the server. (The inspector shows the request that would have been sent.)",
      card: { type: "error", message: configured ? answer.error : "Missing TYPESAFE_API_KEY" },
      state,
      trace: {
        ...base,
        usedQuestions: [],
        decision: {
          outcome: "error",
          reason: configured ? "Jev request failed" : "Jev is not configured",
        },
      },
    });
  }

  const used = new Set<string>(["copilot_move"]);
  const answers = answer.answers;
  const missing = firstMissingArg(state, answers, pools);
  const originalMove = answers.copilot_move?.choice ?? "silent";
  let move = originalMove;
  if (move === "silent" && missing) move = "observe";

  if (move === "silent") {
    return timed(started, {
      text: "",
      silent: true,
      state,
      trace: {
        ...base,
        usedQuestions: [...used],
        decision: { outcome: "silent", reason: "Copilot chose to stay silent" },
      },
    });
  }

  if (move === "observe") {
    used.add("observation");
    const picked = answers.observation?.choice;
    let known = (picked && picked in OBSERVATIONS ? picked : "wait_listening") as ObservationId;
    if (missing && (known === "wait_listening" || originalMove === "silent")) {
      known = "ask";
    }
    return timed(started, observeReply(state, known, base, missing));
  }

  used.add("tool");

  function packedCall(
    working: ConversationState,
    parts: { text: string; card?: Card }[],
    lastSources: ArgTrace[] | undefined,
    lastCall: TurnOutput["trace"]["call"],
    steps: NonNullable<TurnOutput["trace"]["steps"]>,
    lastToolId: string | undefined,
  ): TurnOutput {
    return timed(started, {
      ...pack(parts, suggestionFromResults(working.results ?? [])),
      state: working,
      trace: {
        ...base,
        usedQuestions: [...used],
        args: lastSources,
        call: lastCall,
        steps: steps.length > 1 ? steps : undefined,
        decision: { outcome: "call", reason: "Unprompted copilot chain", toolId: lastToolId },
      },
    });
  }

  async function go(
    working: ConversationState,
    parts: { text: string; card?: Card }[],
    lastSources: ArgTrace[] | undefined,
    steps: NonNullable<TurnOutput["trace"]["steps"]>,
    lastCall: TurnOutput["trace"]["call"],
    lastToolId: string | undefined,
  ): Promise<TurnOutput> {
    const adapter = nextInPipeline(working);
    if (!adapter) {
      if (parts.length === 0) {
        return timed(started, observeReply(working, "wait_listening", base));
      }
      return packedCall(working, parts, lastSources, lastCall, steps, lastToolId);
    }

    const built = adapter.build(new Answers(answers, safeKey(adapter.id), used), pools);
    if (!built.ok) {
      if (parts.length === 0) {
        return timed(
          started,
          observeReply(working, "ask", { ...base, args: built.sources }, built.missing),
        );
      }
      return packedCall(working, parts, lastSources, lastCall, steps, lastToolId);
    }

    if (adapter.confirm?.(built.args)) {
      const prompt = `${adapter.label} with ${describeArgs(built.sources)}`;
      const packed = pack(parts, undefined);
      const confirmCard: Card = {
        type: "confirm",
        title: adapter.label,
        tool: `${SERVER_LABELS[adapter.server]} · ${adapter.mcpName}`,
        args: built.sources.map((s) => ({ name: s.name, value: String(s.value) })),
        confirmLabel: adapter.confirmLabel ?? "Confirm",
        destructive: isDestructive(adapter),
      };
      return timed(started, {
        text: packed.text
          ? `${packed.text}\n\nPlease confirm: ${adapter.label.toLowerCase()}?`
          : `Please confirm: ${adapter.label.toLowerCase()}?`,
        card: packed.card
          ? {
              type: "bundle",
              cards: [
                ...(packed.card.type === "bundle" ? packed.card.cards : [packed.card]),
                confirmCard,
              ],
            }
          : confirmCard,
        state: {
          ...working,
          pending: {
            type: "confirm",
            toolId: adapter.id,
            args: built.args,
            argSources: built.sources,
            prompt,
          },
        },
        trace: {
          ...base,
          usedQuestions: [...used],
          args: built.sources,
          steps: steps.length ? steps : undefined,
          call: lastCall,
          decision: {
            outcome: "confirm",
            reason: "Tool changes data: confirmation required",
            toolId: adapter.id,
          },
        },
      });
    }

    const executed = await execute(adapter, built.args, built.sources, working, {
      ...base,
      usedQuestions: [...used],
      decision: { outcome: "call", reason: "Unprompted copilot chain", toolId: adapter.id },
    });
    const nextSteps = executed.trace.call
      ? [...steps, { title: adapter.label, call: executed.trace.call }]
      : steps;
    const nextCall = executed.trace.call ?? lastCall;
    if (
      executed.trace.decision.outcome === "error" ||
      executed.state.results?.[0]?.toolId !== adapter.id
    ) {
      return timed(started, {
        text: executed.text,
        card: executed.card,
        state: executed.state,
        trace: {
          ...base,
          usedQuestions: [...used],
          args: built.sources,
          call: nextCall,
          steps: nextSteps.length ? nextSteps : undefined,
          decision: executed.trace.decision,
        },
      });
    }
    return go(
      executed.state,
      [...parts, { text: executed.text, card: executed.card }],
      built.sources,
      nextSteps,
      nextCall,
      adapter.id,
    );
  }

  return go(state, [], undefined, [], undefined, undefined);
}
