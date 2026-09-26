import { useState } from "react";
import { Navigate, useParams } from "react-router";

import { ResizeHandle } from "../../components/ui/ResizeHandle.tsx";
import { useMessages, useSendTurn } from "../../queries.ts";
import { INSPECTOR_WIDTH, useUi } from "../../store.ts";
import { Composer } from "../chat/Composer.tsx";
import { MessageBubble } from "../chat/MessageBubble.tsx";
import { Inspector } from "../inspector/Inspector.tsx";

function scrollIntoView(el: HTMLDivElement | null) {
  el?.scrollIntoView({ behavior: "smooth" });
}

/**
 * Two-pane assist: left is a role-played customer / service-rep transcript; right is the
 * back-office assistant that watches the left pane.
 */
export function AssistPage() {
  const { id } = useParams() as { id: string };
  const { data, isLoading, error } = useMessages(id);
  const send = useSendTurn(id);
  const { inspectorOpen, selectedMessageId, select, inspectorWidth, setInspectorWidth } = useUi();
  const [speaker, setSpeaker] = useState<"customer" | "service_rep">("customer");

  const messages = data?.messages ?? [];
  const left = messages.filter((m) => m.pane === "left");
  const right = messages.filter((m) => (m.pane ?? "right") === "right");
  const lastAssistant = right.findLast((m) => m.role === "assistant");
  const selected = messages.find((m) => m.id === selectedMessageId) ?? lastAssistant;

  if (error) return <div className="p-8 text-error">{error.message}</div>;
  if (!isLoading && data?.conversation.kind === "chat") {
    return <Navigate to={`/c/${id}`} replace />;
  }

  return (
    <>
      <div className="grid flex-1 place-items-center p-8 lg:hidden">
        <p className="max-w-sm text-center text-base-content/70">
          Assist is a side-by-side desktop layout. Widen the window to continue.
        </p>
      </div>
      <div className="hidden min-h-0 flex-1 lg:flex">
        <section className="flex min-w-0 flex-1 flex-col border-r border-base-300">
          <header className="border-b border-base-300 px-4 py-2 text-sm font-semibold">
            Customer conversation
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              {isLoading && <span className="loading loading-dots" />}
              {!isLoading && left.length === 0 && (
                <p className="py-12 text-center text-sm text-base-content/60">
                  Role-play a customer and a service representative. The assistant on the right
                  watches this thread.
                </p>
              )}
              {left.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  selected={false}
                  isLatest={false}
                  pending={null}
                  busy={false}
                  onSelect={() => {}}
                  onAction={() => {}}
                />
              ))}
              <div key={left.length} ref={scrollIntoView} />
            </div>
          </div>
          <div className="border-t border-base-300 bg-base-100 px-3 py-3">
            <Composer
              disabled={send.isPending}
              placeholder={
                speaker === "customer" ? "Message as the customer…" : "Message as the service rep…"
              }
              leading={
                <div className="join join-item">
                  <button
                    type="button"
                    className={`btn join-item btn-sm h-auto min-h-12 ${speaker === "customer" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setSpeaker("customer")}
                  >
                    Customer
                  </button>
                  <button
                    type="button"
                    className={`btn join-item btn-sm h-auto min-h-12 ${speaker === "service_rep" ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setSpeaker("service_rep")}
                  >
                    Service rep
                  </button>
                </div>
              }
              onSend={(text) => send.mutate({ text, pane: "left", speaker })}
            />
          </div>
        </section>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-base-300 px-4 py-2 text-sm font-semibold">
            Assistant
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              {!isLoading && left.length === 0 && right.length === 0 && (
                <p className="py-12 text-center text-sm text-base-content/60">
                  The assistant watches the left conversation and can verify identity, look up
                  orders, and request refunds.
                </p>
              )}
              {right.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  selected={m.id === selected?.id}
                  isLatest={m.id === lastAssistant?.id && i === right.length - 1}
                  pending={data?.conversation.pending ?? null}
                  busy={send.isPending}
                  onSelect={() => select(m.id)}
                  onAction={(a) =>
                    send.mutate(
                      a.type === "say"
                        ? { text: a.text, pane: "right", speaker: "service_rep" }
                        : { action: a },
                    )
                  }
                />
              ))}
              {send.isPending && (
                <div className="chat chat-start">
                  <div className="chat-bubble bg-base-100">
                    <span className="loading loading-dots loading-sm" />
                  </div>
                </div>
              )}
              {send.error && <div className="alert alert-error">{send.error.message}</div>}
              <div key={`${right.length}:${send.isPending}`} ref={scrollIntoView} />
            </div>
          </div>
          <div className="border-t border-base-300 bg-base-100 px-3 py-3">
            <Composer
              autoFocus={false}
              disabled={send.isPending}
              placeholder="Ask the assistant…"
              onSend={(text) => send.mutate({ text, pane: "right", speaker: "service_rep" })}
            />
          </div>
        </section>
        {inspectorOpen && (
          <aside
            className="relative hidden max-w-[60vw] shrink-0 border-l border-base-300 bg-base-100 lg:block"
            style={{ width: inspectorWidth }}
          >
            <ResizeHandle
              edge="left"
              label="Resize the inspector"
              width={inspectorWidth}
              min={INSPECTOR_WIDTH.min}
              max={INSPECTOR_WIDTH.max}
              defaultWidth={INSPECTOR_WIDTH.default}
              onResize={setInspectorWidth}
            />
            <div className="h-full overflow-y-auto">
              <Inspector message={selected} />
            </div>
          </aside>
        )}
      </div>
    </>
  );
}
