import { MAX_MESSAGE_CHARS } from "@jev-chat/server/types";
import { useState, type ReactNode } from "react";

/** The message input. Sends trimmed, non-empty text and clears itself; autofocuses on mount. */
export function Composer({
  onSend,
  disabled,
  placeholder = "Look up an order, request a refund, verify identity…",
  autoFocus = true,
  leading,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  leading?: ReactNode;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };
  return (
    <form
      className="join w-full"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {leading}
      <input
        className="input join-item input-lg w-full"
        placeholder={placeholder}
        value={text}
        maxLength={MAX_MESSAGE_CHARS}
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="btn btn-primary btn-lg join-item" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
}
