import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { HISTORY_KEPT } from "./config.ts";
import { db, schema } from "./db/index.ts";
import { createConversationSchema, sendMessageSchema } from "./db/schema.ts";
import { serverStatuses } from "./mcp/clients.ts";
import {
  actionLabel,
  type ConversationKind,
  type ConversationState,
  type MessagePane,
  type MessageRole,
} from "./shared/types.ts";
import { handleAssistTurn, type AssistInput } from "./turn/assist.ts";
import { handleTurn, type TurnInput } from "./turn/turn.ts";

const { conversations, messages } = schema;

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("confirm") }),
  z.object({ type: z.literal("cancel") }),
  z.object({ type: z.literal("pick"), value: z.string() }),
]);

const conversationSummary = {
  id: conversations.id,
  title: conversations.title,
  kind: conversations.kind,
  createdAt: conversations.createdAt,
};

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const turnQueues = new Map<string, Promise<unknown>>();

type MessageRow = typeof messages.$inferSelect;
type TurnReply = MessageRow | { silent: true };

async function runTurn(
  conversationId: string,
  job: () => Promise<TurnReply | undefined>,
): Promise<TurnReply | undefined> {
  const run = (turnQueues.get(conversationId) ?? Promise.resolve()).then(() => job());
  const settled = run.catch(() => {});
  turnQueues.set(conversationId, settled);
  try {
    return await run;
  } finally {
    if (turnQueues.get(conversationId) === settled) turnQueues.delete(conversationId);
  }
}

function insertHuman(conversationId: string, role: MessageRole, pane: MessagePane, text: string) {
  db.insert(messages).values({ id: crypto.randomUUID(), conversationId, role, pane, text }).run();
}

function insertAssistant(
  conversationId: string,
  out: { text: string; card?: MessageRow["card"]; trace: MessageRow["trace"] },
): MessageRow {
  return db
    .insert(messages)
    .values({
      id: crypto.randomUUID(),
      conversationId,
      role: "assistant",
      pane: "right",
      text: out.text,
      card: out.card,
      trace: out.trace,
    })
    .returning()
    .get();
}

async function runChatTurn(
  conversationId: string,
  convo: typeof conversations.$inferSelect,
  input: TurnInput,
  userText: string,
): Promise<MessageRow> {
  insertHuman(conversationId, "user", "right", userText);
  const out = await handleTurn(input, convo.state);
  const recent = [
    ...out.state.recent,
    { user: out.message ?? userText, assistant: out.text },
  ].slice(-HISTORY_KEPT);
  const state: ConversationState = { ...out.state, recent };
  const title =
    convo.title === "New chat" && input.kind === "message" ? userText.slice(0, 60) : convo.title;
  db.update(conversations).set({ state, title }).where(eq(conversations.id, conversationId)).run();
  return insertAssistant(conversationId, out);
}

async function runAssistQueued(
  conversationId: string,
  convo: typeof conversations.$inferSelect,
  input: AssistInput,
  userText: string,
  role: MessageRole,
  pane: MessagePane,
): Promise<TurnReply> {
  insertHuman(conversationId, role, pane, userText);
  const out = await handleAssistTurn(input, convo.state);
  const untitled = convo.title === "New assist" || convo.title === "New chat";
  const title = untitled ? userText.slice(0, 60) : convo.title;
  db.update(conversations)
    .set({ state: out.state, title })
    .where(eq(conversations.id, conversationId))
    .run();
  if (out.silent) return { silent: true };
  return insertAssistant(conversationId, out);
}

export const app = new Hono()
  .basePath("/api")
  .use(async (c, next) => {
    if (!LOCAL_HOSTNAMES.has(new URL(c.req.url).hostname)) {
      return c.json({ error: "Forbidden host" }, 403);
    }
    const origin = c.req.header("origin");
    if (origin && !LOCAL_HOSTNAMES.has(URL.parse(origin)?.hostname ?? "")) {
      return c.json({ error: "Forbidden origin" }, 403);
    }
    return next();
  })
  .get("/health", (c) => c.json({ ok: true }))
  .get("/tools", (c) => c.json({ servers: serverStatuses() }))
  .get("/conversations", (c) =>
    c.json(
      db
        .select(conversationSummary)
        .from(conversations)
        .orderBy(desc(conversations.createdAt))
        .all(),
    ),
  )
  .post("/conversations", async (c) => {
    let kind: ConversationKind = "chat";
    if (c.req.header("content-type")?.includes("application/json")) {
      const raw: unknown = await c.req.json().catch(() => ({}));
      const parsed = createConversationSchema.safeParse(raw);
      if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
      kind = parsed.data.kind ?? "chat";
    }
    const convo = db
      .insert(conversations)
      .values({
        id: crypto.randomUUID(),
        kind,
        title: kind === "assist" ? "New assist" : "New chat",
        state: { recent: [] },
      })
      .returning(conversationSummary)
      .get();
    return c.json(convo, 201);
  })
  .delete("/conversations/:id", (c) => {
    db.delete(conversations)
      .where(eq(conversations.id, c.req.param("id")))
      .run();
    return c.json({ ok: true });
  })
  .get("/conversations/:id/messages", (c) => {
    const id = c.req.param("id");
    const convo = db.select().from(conversations).where(eq(conversations.id, id)).get();
    if (!convo) return c.json({ error: "Not found" }, 404);
    const rows = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt))
      .all();
    return c.json({
      conversation: {
        id: convo.id,
        title: convo.title,
        kind: convo.kind,
        pending: convo.state.pending ?? null,
      },
      messages: rows,
    });
  })
  .post("/conversations/:id/messages", zValidator("json", sendMessageSchema), async (c) => {
    const id = c.req.param("id");
    const { text, spellcheck, pane, speaker } = c.req.valid("json");
    const reply = await runTurn(id, async (): Promise<TurnReply | undefined> => {
      const convo = db.select().from(conversations).where(eq(conversations.id, id)).get();
      if (!convo) return undefined;
      if (convo.kind === "assist") {
        const side: MessagePane = pane ?? "right";
        if (side === "left") {
          const who = speaker ?? "customer";
          return runAssistQueued(
            id,
            convo,
            { kind: "left", speaker: who, text },
            text,
            who,
            "left",
          );
        }
        return runAssistQueued(
          id,
          convo,
          { kind: "right", text, spellcheck },
          text,
          "service_rep",
          "right",
        );
      }
      return runChatTurn(id, convo, { kind: "message", text, spellcheck }, text);
    });
    if (!reply) return c.json({ error: "Not found" }, 404);
    return c.json(reply);
  })
  .post("/conversations/:id/actions", zValidator("json", actionSchema), async (c) => {
    const id = c.req.param("id");
    const action = c.req.valid("json");
    const label = actionLabel(action);
    const input: AssistInput | TurnInput =
      action.type === "pick"
        ? { kind: "action", type: "pick", value: action.value }
        : { kind: "action", type: action.type };

    const reply = await runTurn(id, async (): Promise<TurnReply | undefined> => {
      const convo = db.select().from(conversations).where(eq(conversations.id, id)).get();
      if (!convo) return undefined;
      if (convo.kind === "assist") {
        return runAssistQueued(id, convo, input, label, "service_rep", "right");
      }
      return runChatTurn(id, convo, input, label);
    });
    if (!reply) return c.json({ error: "Not found" }, 404);
    return c.json(reply);
  });

export type AppType = typeof app;
