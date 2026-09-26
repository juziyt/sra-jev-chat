/* oxlint-disable no-console */
import { serve } from "@hono/node-server";

import { app } from "./app.ts";
import { closeAll, connectAll } from "./mcp/clients.ts";

const port = Number(process.env.PORT ?? 8787);

await connectAll();

if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.warn(
    "[jev] TYPESAFE_API_KEY is not set — turns will return the request without calling Jev",
  );
}

const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) =>
  console.log(`[server] http://localhost:${info.port}/api`),
);

const shutdown = async () => {
  server.close();
  await closeAll();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
