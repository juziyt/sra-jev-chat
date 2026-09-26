import { describe, expect, it } from "vitest";

import { buildArgs, runBuild, textResult, toolResult } from "../kit/testkit.ts";
import { verifyIdentity } from "./identity.ts";

const MESSAGE = "Verify Jane Smith at jane.smith@example.com";

describe("verifyIdentity.build", () => {
  it("takes the name and email from the message", () => {
    expect(
      buildArgs(verifyIdentity, {
        message: MESSAGE,
        answers: { name: "Jane Smith", email: "jane.smith@example.com" },
      }),
    ).toEqual({ name: "Jane Smith", email: "jane.smith@example.com" });
  });

  it("asks for name and email together when neither is present", () => {
    const { result } = runBuild(verifyIdentity, {
      message: "Verify this person",
      answers: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("name and email");
  });

  it("asks for the name rather than guessing one", () => {
    const { result } = runBuild(verifyIdentity, {
      message: "Verify jane.smith@example.com",
      answers: { email: "jane.smith@example.com" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("name");
  });

  it("asks for the email rather than guessing one", () => {
    const { result } = runBuild(verifyIdentity, {
      message: "Verify Jane Smith",
      answers: { name: "Jane Smith" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toBe("email");
  });

  it("uses a typed pending reply as the name or email even when Jev picks none", () => {
    const { result } = runBuild(verifyIdentity, {
      message: "Jane Smith",
      answers: {},
      partial: { __answer: "Jane Smith" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toBe("email");
      expect(result.partial).toEqual({ name: "Jane Smith" });
    }
    expect(
      buildArgs(verifyIdentity, {
        message: "jane.smith@example.com",
        answers: {},
        partial: { name: "Jane Smith", __answer: "jane.smith@example.com" },
      }),
    ).toEqual({ name: "Jane Smith", email: "jane.smith@example.com" });
  });

  it("does not send the pending-answer hint to the tool", () => {
    expect(
      buildArgs(verifyIdentity, {
        message: "Jane Smith",
        answers: {},
        partial: { email: "jane.smith@example.com", __answer: "Jane Smith" },
      }),
    ).toEqual({ name: "Jane Smith", email: "jane.smith@example.com" });
  });
});

describe("verifyIdentity.present", () => {
  it("shows a success card when the identity is verified", () => {
    const out = verifyIdentity.present(
      toolResult({
        text: "Jane Smith (jane.smith@example.com) is verified.",
        name: "Jane Smith",
        email: "jane.smith@example.com",
        verified: true,
      }),
      {},
    );
    expect(out.card).toMatchObject({ type: "action", title: "Verified", ok: true });
    expect(out.lastResult?.items).toEqual([
      { title: "Jane Smith", subtitle: "jane.smith@example.com" },
    ]);
  });

  it("shows a failure card when the identity is not verified", () => {
    const out = verifyIdentity.present(
      toolResult({
        text: "Jane Smith (other@example.com) is not verified.",
        name: "Jane Smith",
        email: "other@example.com",
        verified: false,
      }),
      {},
    );
    expect(out.card).toMatchObject({ type: "action", title: "Not verified", ok: false });
  });

  it("falls back to the tool's own text when the result doesn't match the expected shape", () => {
    const out = verifyIdentity.present(textResult("lookup failed"), {});
    expect(out.card?.type).toBe("error");
  });
});
