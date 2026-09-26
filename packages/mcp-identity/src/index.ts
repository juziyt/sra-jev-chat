#!/usr/bin/env node
import { defineTool, serve, structured } from "@jev-chat/mcp-kit";
import { z } from "zod";

import { verifyIdentity } from "./catalog.ts";

await serve("identity", "0.1.0", (server) => {
  defineTool(
    server,
    "verify_identity",
    {
      title: "Verify identity",
      description: "Check whether a full name and email address match a known person.",
      inputSchema: {
        name: z.string().describe("Full name, e.g. 'Jane Smith'"),
        email: z.string().describe("Email address, e.g. 'jane.smith@example.com'"),
      },
      outputSchema: {
        name: z.string(),
        email: z.string(),
        verified: z.boolean(),
        text: z.string(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ name, email }) => {
      const out = verifyIdentity(name, email);
      return structured(out.text, out);
    },
  );
});
