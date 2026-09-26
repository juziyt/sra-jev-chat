import { useState } from "react";

import { keyed } from "../ui/keyed.ts";
import type { CardComponent } from "./types.ts";

/** The outcome of a tool call the assistant made, styled as success or error. */
export const ActionCard: CardComponent<"action"> = ({ card }) => (
  <div role="alert" className={`alert alert-soft ${card.ok ? "alert-success" : "alert-error"}`}>
    <div>
      <div className="font-semibold">{card.title}</div>
      {keyed(card.lines, (l) => l).map(({ key, item }) => (
        <div key={key} className="text-sm">
          {item}
        </div>
      ))}
    </div>
  </div>
);

/** The traced arguments of a pending write, shown before it happens, with Cancel and confirm buttons. */
export const ConfirmCard: CardComponent<"confirm"> = ({ card, interactive, onAction }) => (
  <div
    className={`card border ${card.destructive ? "border-warning" : "border-base-300"} bg-base-100`}
  >
    <div className="card-body p-3">
      <div className="text-xs text-base-content/60">⚠ Confirm · {card.tool}</div>
      <table className="table table-xs">
        <tbody>
          {card.args.map((a) => (
            <tr key={a.name}>
              <td className="font-mono text-base-content/60">{a.name}</td>
              <td className="font-medium">{a.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card-actions justify-end">
        <button
          className="btn btn-ghost btn-sm"
          disabled={!interactive}
          onClick={() => onAction({ type: "cancel" })}
        >
          Cancel
        </button>
        <button
          className="btn btn-warning btn-sm"
          disabled={!interactive}
          onClick={() => onAction({ type: "confirm" })}
        >
          {card.confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

/** One button per option the user can pick between. */
export const ChoicesCard: CardComponent<"choices"> = ({ card, interactive, onAction }) => (
  <div className="flex flex-wrap gap-2">
    {card.options.map((o) => (
      <button
        key={o.value}
        className="btn btn-outline btn-sm"
        title={o.description}
        disabled={!interactive}
        onClick={() => onAction({ type: "pick", value: o.value })}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/** An error message in an alert. */
export const ErrorCard: CardComponent<"error"> = ({ card }) => (
  <div role="alert" className="alert alert-error alert-soft text-sm">
    {card.message}
  </div>
);

/** A canned customer reply the service rep can copy into the left pane. */
export const SuggestionCard: CardComponent<"suggestion"> = ({ card }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-box border border-dashed border-base-300 bg-base-200 p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/60">
        Suggested reply
      </div>
      <p className="whitespace-pre-line text-sm">{card.text}</p>
      <button
        type="button"
        className="btn btn-ghost btn-xs mt-2"
        onClick={() => {
          void navigator.clipboard.writeText(card.text).then(
            () => setCopied(true),
            () => {},
          );
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};

/** Each tool server with its connection status and example prompts. */
export const CapabilitiesCard: CardComponent<"capabilities"> = ({ card }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {card.servers.map((s) => (
      <div key={s.label} className="rounded-lg bg-base-200 p-2 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <span className={`status ${s.connected ? "status-success" : "status-warning"}`} />{" "}
          {s.label}
        </div>
        {s.examples.map((e) => (
          <div key={e} className="text-base-content/70">
            “{e}”
          </div>
        ))}
      </div>
    ))}
  </div>
);
