import { describe, expect, it } from "vitest";

import { verifyIdentity } from "./catalog.ts";

describe("verifyIdentity", () => {
  it("verifies a matching name and email, ignoring case and extra spaces", () => {
    expect(verifyIdentity("Jane Smith", "jane.smith@example.com")).toMatchObject({
      verified: true,
      text: "Jane Smith (jane.smith@example.com) is verified.",
    });
    expect(verifyIdentity("  jane   smith ", "Jane.Smith@Example.com").verified).toBe(true);
  });

  it("rejects a name and email that are not the same catalog record", () => {
    expect(verifyIdentity("Jane Smith", "alex.rivera@example.com").verified).toBe(false);
    expect(verifyIdentity("Alex Rivera", "jane.smith@example.com").verified).toBe(false);
    expect(verifyIdentity("Nobody", "nobody@example.com")).toMatchObject({
      verified: false,
      text: "Nobody (nobody@example.com) is not verified.",
    });
  });
});
