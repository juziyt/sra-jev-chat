import { beforeAll, describe, expect, it, vi } from "vitest";

import type { ServerStatus } from "../mcp/clients.ts";

/** Question key → the option (by key or label) the fake Jev below picks. */
const wanted: Record<string, string> = {
  request_kind: "new_request",
  tool: "orders_get_order",
  orders_get_order__order_id: "ORD-1001",
};

/** Unlisted questions get their "leave it" option when they have one, else their last option. */
const NO_PICK = new Set(["none", "keep", "as_is"]);

/** Set by a test to make the next Jev request fail, so the error path can be checked. */
let failNextJev = false;

vi.mock("@typesafe-ai/sdk", () => ({
  TypeSafeClient: class {
    async systemOne({
      questions,
    }: {
      questions: Record<string, { type: string; criteria?: Record<string, string> }>;
    }) {
      if (failNextJev) {
        failNextJev = false;
        throw new Error("upstream exploded");
      }
      const answers: Record<string, unknown> = {};
      for (const [key, q] of Object.entries(questions)) {
        if (q.type === "noul") {
          answers[key] = { type: "noul", noul: 0.1 };
          continue;
        }
        const options = Object.entries(q.criteria ?? {});
        const hit =
          options.find(([k, label]) => k === wanted[key] || label === wanted[key]) ??
          options.find(([k]) => NO_PICK.has(k)) ??
          options[options.length - 1];
        answers[key] = {
          type: "choice",
          choice: hit[0],
          confidence: 0.9,
          probabilities: Object.fromEntries(
            options.map(([o]) => [o, o === hit[0] ? 0.95 : 0.05 / options.length]),
          ),
        };
      }
      return { model: "fake", answers, usage: { input_tokens: 1, output_tokens: 1 } };
    }
  },
}));

const order = {
  text: "ORD-1001 · Shipped · 1 item · $90.32 · Denver, CO",
  id: "ORD-1001",
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
};

const calls: { server: string; tool: string; args: Record<string, unknown> }[] = [];

const ordersStatus = {
  id: "orders",
  label: "Orders",
  status: "connected",
  tools: [
    {
      name: "get_order",
      inputSchema: { type: "object", properties: { order_id: {} } },
    },
  ],
} as ServerStatus;

vi.mock("../mcp/clients.ts", () => ({
  isConnected: () => true,
  serverStatuses: (): ServerStatus[] => [ordersStatus],
  statusOf: (id: string) => (id === "orders" ? ordersStatus : undefined),
  disconnectedReason: () => "not connected",
  toolSpecOf: (server: string, name: string) =>
    server === "orders" ? ordersStatus.tools.find((t) => t.name === name) : undefined,
  callTool: async (server: string, tool: string, args: Record<string, unknown>) => {
    calls.push({ server, tool, args });
    return {
      result: { content: [{ type: "text", text: order.text }], structuredContent: order },
      ms: 3,
    };
  },
  connectAll: async () => [],
  closeAll: async () => {},
}));

describe("handleTurn", () => {
  beforeAll(() => {
    process.env.TYPESAFE_API_KEY = "test";
  });

  it("routes an order lookup, fills args from spans, and calls the tool", async () => {
    const { handleTurn } = await import("./turn.ts");
    const out = await handleTurn(
      { kind: "message", text: "Where is order ORD-1001?", spellcheck: false },
      { recent: [] },
    );

    expect(out.trace.decision.outcome).toBe("call");
    expect(out.trace.call?.args).toMatchObject({ order_id: "ORD-1001" });
    expect(out.card?.type).toBe("order");
    expect(out.trace.usedQuestions).toContain("orders_get_order__order_id");
    expect(calls.at(-1)).toMatchObject({ server: "orders", tool: "get_order" });
  });

  it("carries the result's numbers into state so a follow-up can reuse them", async () => {
    const { handleTurn } = await import("./turn.ts");
    const out = await handleTurn(
      { kind: "message", text: "Where is order ORD-1001?", spellcheck: false },
      { recent: [] },
    );

    expect(out.state.results?.[0].numbers.map((n) => n.value)).toContain(90.32);
  });

  it("cancels a pending confirmation without asking Jev", async () => {
    const { handleTurn } = await import("./turn.ts");
    const pending = {
      type: "confirm" as const,
      toolId: "orders.initiate_refund",
      args: { order_id: "ORD-1001", reason: "arrived damaged" },
      argSources: [],
      prompt: 'Initiate refund with order_id="ORD-1001"',
    };
    const out = await handleTurn({ kind: "action", type: "cancel" }, { recent: [], pending });

    expect(out.trace.decision.outcome).toBe("cancel");
    expect(out.state.pending).toBeUndefined();
    expect(out.trace.jev).toBeUndefined();
  });

  it("reports a stale button instead of throwing", async () => {
    const { handleTurn } = await import("./turn.ts");
    const out = await handleTurn(
      { kind: "action", type: "confirm" },
      { recent: [], pending: { type: "choose", options: [], message: "", prompt: "" } },
    );

    expect(out.trace.decision.outcome).toBe("error");
    expect(out.text).toMatch(/expired/i);
  });

  it("rejects a pick that wasn't one of the offered buttons", async () => {
    const { handleTurn } = await import("./turn.ts");
    const pending = {
      type: "choose" as const,
      options: ["orders.get_order"],
      message: "Where is order ORD-1001?",
      prompt: "",
    };
    const out = await handleTurn(
      { kind: "action", type: "pick", value: "identity.verify_identity" },
      { recent: [], pending },
    );

    expect(out.text).toMatch(/expired/i);
    expect(out.state.pending).toEqual(pending);
  });

  const confirmable = {
    type: "confirm" as const,
    toolId: "orders.get_order",
    args: { order_id: "ORD-1001" },
    argSources: [],
    prompt: 'Order lookup with order_id="ORD-1001"',
  };

  it("runs the pending tool when the button is clicked", async () => {
    const { handleTurn } = await import("./turn.ts");
    const out = await handleTurn(
      { kind: "action", type: "confirm" },
      { recent: [], pending: confirmable },
    );

    expect(out.trace.decision).toMatchObject({ outcome: "call", toolId: "orders.get_order" });
    expect(out.state.pending).toBeUndefined();
    expect(calls.at(-1)).toMatchObject({ tool: "get_order", args: { order_id: "ORD-1001" } });
  });

  it("runs the pending tool when the message says yes, and records why", async () => {
    const { handleTurn } = await import("./turn.ts");
    wanted.request_kind = "confirm_yes";
    try {
      const out = await handleTurn(
        { kind: "message", text: "yes please", spellcheck: false },
        { recent: [], pending: confirmable },
      );
      expect(out.trace.decision).toMatchObject({
        outcome: "call",
        requestKind: "confirm_yes",
        toolId: "orders.get_order",
      });
      expect(out.trace.jev).toBeDefined();
      expect(out.state.pending).toBeUndefined();
    } finally {
      wanted.request_kind = "new_request";
    }
  });

  it("says so when the pending tool no longer exists", async () => {
    const { handleTurn } = await import("./turn.ts");
    const out = await handleTurn(
      { kind: "action", type: "confirm" },
      { recent: [], pending: { ...confirmable, toolId: "orders.renamed_away" } },
    );

    expect(out.trace.decision.outcome).toBe("error");
    expect(out.text).toMatch(/no longer valid/i);
    expect(out.state.pending).toBeUndefined();
  });

  it("reports a Jev failure as an error reply that still carries the request", async () => {
    const { handleTurn } = await import("./turn.ts");
    failNextJev = true;
    const out = await handleTurn(
      { kind: "message", text: "Where is order ORD-1001?", spellcheck: false },
      { recent: [] },
    );

    expect(out.trace.decision.outcome).toBe("error");
    expect(out.trace.jev?.error).toMatch(/upstream exploded/);
    expect(out.trace.jev?.request.questions).toHaveProperty("tool");
    expect(out.card).toMatchObject({ type: "error" });
  });

  it("spell-checks a message unless told not to", async () => {
    const { handleTurn } = await import("./turn.ts");
    const text = "Wher is order ORD-1001?";
    const checked = await handleTurn({ kind: "message", text }, { recent: [] });
    const unchecked = await handleTurn(
      { kind: "message", text, spellcheck: false },
      { recent: [] },
    );

    expect(checked.trace.spelling?.original).toBe(text);
    expect(unchecked.trace.spelling).toBeUndefined();
  });

  it("runs a tool picked from the choice buttons on the original message", async () => {
    const { handleTurn } = await import("./turn.ts");
    const message = "Where is order ORD-1001?";
    const out = await handleTurn(
      { kind: "action", type: "pick", value: "orders.get_order" },
      {
        recent: [],
        pending: { type: "choose", options: ["orders.get_order"], message, prompt: "" },
      },
    );

    expect(out.message).toBe(message);
    expect(out.trace.decision).toMatchObject({ outcome: "call", toolId: "orders.get_order" });
    expect(out.trace.decision.reason).toMatch(/picked this tool/);
    expect(out.trace.spelling).toBeUndefined();
    expect(out.state.pending).toBeUndefined();
  });

  it("answers small talk with what it can do", async () => {
    const { handleTurn } = await import("./turn.ts");
    wanted.request_kind = "chat";
    try {
      const out = await handleTurn(
        { kind: "message", text: "thanks!", spellcheck: false },
        { recent: [] },
      );
      expect(out.text).toBe("You're welcome!");
      expect(out.trace.decision.outcome).toBe("chat");
      expect(out.card?.type).toBe("capabilities");
    } finally {
      wanted.request_kind = "new_request";
    }
  });

  it("says it can't help when no tool fits", async () => {
    const { handleTurn } = await import("./turn.ts");
    wanted.tool = "none";
    try {
      const out = await handleTurn(
        { kind: "message", text: "Book me a flight", spellcheck: false },
        { recent: [] },
      );
      expect(out.text).toMatch(/can't do that yet/);
      expect(out.trace.decision).toMatchObject({ outcome: "unsupported", reason: "No tool fits" });
      expect(out.card?.type).toBe("capabilities");
    } finally {
      wanted.tool = "orders_get_order";
    }
  });
});
