import { z } from "zod";

import type { Candidate } from "../../jev/pools.ts";
import { candidateQ } from "../../jev/questions.ts";
import { rawFallback, readResult, type SingleStepAdapter } from "../kit/adapter.ts";
import { Args } from "../kit/args.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emails(pool: Candidate[]): Candidate[] {
  return pool.filter((c) => EMAIL.test(c.value.trim()));
}

function names(pool: Candidate[]): Candidate[] {
  return pool.filter((c) => !EMAIL.test(c.value.trim()));
}

/** Put a typed pending reply into `name` or `email` by shape, without overwriting a Jev pick. */
function takeAnswer(args: Args, text: string) {
  const value = text.trim();
  if (!value) return;
  if (EMAIL.test(value)) {
    if (!args.has("email")) args.set("email", value, "message");
  } else if (!args.has("name")) {
    args.set("name", value, "message");
  }
}

const verifyResult = z.object({
  text: z.string(),
  name: z.string(),
  email: z.string(),
  verified: z.boolean(),
});

export const verifyIdentity: SingleStepAdapter = {
  id: "identity.verify_identity",
  server: "identity",
  mcpName: "verify_identity",
  label: "Verify identity",
  description:
    "Verify a person's identity from a full name and email address (known or not; not a login, not adding a contact)",
  examples: ["Verify Jane Smith at jane.smith@example.com"],
  questions: (p) => ({
    name: candidateQ(
      "For identity verification: which phrase is the person's full name?",
      names(p.text),
      "No full name is mentioned",
    ),
    email: candidateQ(
      "For identity verification: which phrase is the email address?",
      emails(p.text),
      "No email address is mentioned",
    ),
  }),
  build(a, p, partial = {}) {
    const { __answer, ...kept } = partial;
    const args = new Args(a, kept);
    args.pick("name", names(p.text));
    args.pick("email", emails(p.text));
    if (typeof __answer === "string") takeAnswer(args, __answer);
    if (!args.has("name") && !args.has("email")) {
      return args.missing("name and email", "What is the full name and email address?");
    }
    if (!args.has("name")) return args.missing("name", "What is the full name?");
    if (!args.has("email")) return args.missing("email", "What is the email address?");
    return args.ok();
  },
  present(result) {
    const r = readResult(result, verifyResult, "verify_identity");
    if (!r) return rawFallback(result);
    return {
      text: r.text,
      card: {
        type: "action",
        title: r.verified ? "Verified" : "Not verified",
        lines: [r.name, r.email],
        ok: r.verified,
      },
      lastResult: {
        summary: r.text,
        items: [{ title: r.name, subtitle: r.email }],
        numbers: [],
      },
    };
  },
};
