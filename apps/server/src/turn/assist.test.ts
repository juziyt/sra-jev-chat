import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const wanted: Record<string, string> = {
  copilot_move: "silent",
  observation: "wait_listening",
  tool: "none",
  request_kind: "new_request",
};

const NO_PICK = new Set(["none", "keep", "as_is"]);

vi.mock("@typesafe-ai/sdk", () => ({
  TypeSafeClient: class {
    async systemOne({
      questions,
    }: {
      questions: Record<string, { type: string; criteria?: Record<string, string> }>;
    }) {
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

const identityOk = {
  text: "Jane Smith (jane.smith@example.com) is verified.",
  name: "Jane Smith",
  email: "jane.smith@example.com",
  verified: true,
};

const orderOk = {
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

const refundOk = {
  text: "Refund request REF-1001 for ORD-1001.",
  refund_id: "REF-1001",
  order_id: "ORD-1001",
  reason: "arrived damaged",
};

const calls: { server: string; tool: string; args: Record<string, unknown> }[] = [];

vi.mock("../mcp/clients.ts", () => ({
  isConnected: () => true,
  serverStatuses: () => [],
  statusOf: () => {},
  disconnectedReason: () => "not connected",
  toolSpecOf: (server: string, name: string) =>
    ({
      name,
      inputSchema: {
        type: "object",
        properties: {
          name: {},
          email: {},
          order_id: {},
          reason: {},
        },
      },
    }) as { name: string; inputSchema: { type: string; properties: Record<string, unknown> } },
  callTool: async (server: string, tool: string, args: Record<string, unknown>) => {
    calls.push({ server, tool, args });
    if (tool === "verify_identity") {
      return {
        result: {
          content: [{ type: "text", text: identityOk.text }],
          structuredContent: identityOk,
        },
        ms: 1,
      };
    }
    if (tool === "get_order") {
      return {
        result: { content: [{ type: "text", text: orderOk.text }], structuredContent: orderOk },
        ms: 1,
      };
    }
    if (tool === "initiate_refund") {
      return {
        result: { content: [{ type: "text", text: refundOk.text }], structuredContent: refundOk },
        ms: 1,
      };
    }
    return { result: { content: [{ type: "text", text: "nope" }], isError: true }, ms: 1 };
  },
  connectAll: async () => [],
  closeAll: async () => {},
}));

const FULL = "I'm Jane Smith, jane.smith@example.com. Refund order ORD-1001, it arrived damaged.";

describe("handleAssistTurn", () => {
  beforeAll(() => {
    process.env.TYPESAFE_API_KEY = "test";
  });

  beforeEach(() => {
    calls.length = 0;
    wanted.copilot_move = "silent";
    wanted.observation = "wait_listening";
    wanted.tool = "none";
    delete wanted.identity_verify_identity__name;
    delete wanted.identity_verify_identity__email;
    delete wanted.orders_get_order__order_id;
    delete wanted.orders_initiate_refund__order_id;
    delete wanted.orders_initiate_refund__reason;
  });

  it("asks for missing identity instead of staying silent on a refund request", async () => {
    const { handleAssistTurn } = await import("./assist.ts");
    wanted.copilot_move = "silent";
    const out = await handleAssistTurn(
      { kind: "left", speaker: "customer", text: "I want to refund my order" },
      { recent: [] },
    );
    expect(out.silent).toBeUndefined();
    expect(out.text).toBe("Ask the customer for name and email.");
  });

  it("stays silent when Jev picks silent and the pipeline has nothing left to collect", async () => {
    const { handleAssistTurn } = await import("./assist.ts");
    wanted.copilot_move = "silent";
    const out = await handleAssistTurn(
      { kind: "left", speaker: "customer", text: "thanks" },
      {
        recent: [],
        results: [
          {
            toolId: "identity.verify_identity",
            label: "Verify identity",
            args: {},
            summary: "Jane Smith (jane.smith@example.com) is verified.",
            items: [{ title: "Jane Smith", subtitle: "jane.smith@example.com" }],
            numbers: [],
          },
          {
            toolId: "orders.get_order",
            label: "Order lookup",
            args: {},
            summary: "ORD-1001 · cancelled · 1 item",
            items: [],
            numbers: [],
          },
        ],
      },
    );
    expect(out.silent).toBe(true);
    expect(out.state.left).toEqual([{ speaker: "customer", text: "thanks" }]);
  });

  it("posts an ask filled from the next missing argument", async () => {
    const { handleAssistTurn } = await import("./assist.ts");
    wanted.copilot_move = "observe";
    wanted.observation = "ask";
    const out = await handleAssistTurn(
      { kind: "left", speaker: "customer", text: "I want a refund" },
      { recent: [] },
    );
    expect(out.trace.decision.outcome).toBe("observe");
    expect(out.text).toBe("Ask the customer for name and email.");
    expect(out.card).toBeUndefined();
  });

  it("asks for email instead of staying silent once the name is present", async () => {
    const { handleAssistTurn } = await import("./assist.ts");
    wanted.copilot_move = "silent";
    wanted.identity_verify_identity__name = "Jane Smith";
    const out = await handleAssistTurn(
      { kind: "left", speaker: "customer", text: "my name is Jane Smith" },
      { recent: [], left: [{ speaker: "customer", text: "I want to refund my order" }] },
    );
    expect(out.silent).toBeUndefined();
    expect(out.text).toBe("Ask the customer for email.");
  });

  it("posts a wait observation named after the missing argument", async () => {
    const { handleAssistTurn } = await import("./assist.ts");
    wanted.copilot_move = "observe";
    wanted.observation = "wait";
    const out = await handleAssistTurn(
      { kind: "left", speaker: "customer", text: "any update?" },
      {
        recent: [],
        results: [
          {
            toolId: "identity.verify_identity",
            label: "Verify identity",
            args: {},
            summary: "Jane Smith (jane.smith@example.com) is verified.",
            items: [{ title: "Jane Smith", subtitle: "jane.smith@example.com" }],
            numbers: [],
          },
        ],
      },
    );
    expect(out.text).toBe("Waiting for order_id.");
    expect(out.card).toBeUndefined();
  });

  it("chains identity and order lookup, then asks to confirm the refund", async () => {
    const { handleAssistTurn } = await import("./assist.ts");
    wanted.copilot_move = "use_tool";
    wanted.identity_verify_identity__name = "Jane Smith";
    wanted.identity_verify_identity__email = "jane.smith@example.com";
    wanted.orders_get_order__order_id = "ORD-1001";
    wanted.orders_initiate_refund__order_id = "ORD-1001";
    wanted.orders_initiate_refund__reason = "arrived damaged";
    const out = await handleAssistTurn(
      { kind: "left", speaker: "customer", text: FULL },
      { recent: [] },
    );
    expect(calls.map((c) => c.tool)).toEqual(["verify_identity", "get_order"]);
    expect(out.trace.decision.outcome).toBe("confirm");
    expect(out.state.pending?.type).toBe("confirm");
    expect(out.card?.type).toBe("bundle");
    if (out.card?.type === "bundle") {
      expect(out.card.cards.map((c) => c.type)).toEqual(["action", "order", "confirm"]);
    }
  });
});
