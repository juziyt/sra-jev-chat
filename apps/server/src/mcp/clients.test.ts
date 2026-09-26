import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ServerStatus } from "./clients.ts";

interface StdioParams {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  stderr: string;
}

const transports: StdioParams[] = [];
const closed: string[] = [];

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class {
    constructor(readonly params: StdioParams) {
      transports.push(params);
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    cwd = "";
    async connect(transport: { params: StdioParams }) {
      this.cwd = transport.params.cwd ?? "";
      if (this.cwd.endsWith("mcp-orders")) throw new Error("spawn failed");
    }
    async listTools() {
      return {
        tools: [{ name: "verify_identity", description: "Verify", inputSchema: {}, extra: "x" }],
      };
    }
    async callTool({ name }: { name: string }) {
      return { content: [{ type: "text", text: `called ${name}` }] };
    }
    async close() {
      closed.push(this.cwd);
      if (this.cwd.endsWith("mcp-identity")) throw new Error("already closed");
    }
  },
}));

const mcp = await import("./clients.ts");

describe("MCP clients", () => {
  let statuses: ServerStatus[];

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    statuses = await mcp.connectAll();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("connects each server once and reports them in order", async () => {
    expect(await mcp.connectAll()).toBe(statuses);
    expect(mcp.serverStatuses().map((s) => [s.id, s.status])).toEqual([
      ["orders", "error"],
      ["identity", "connected"],
    ]);
  });

  it("keeps only the tool fields the app reads", () => {
    expect(mcp.statusOf("identity")).toEqual({
      id: "identity",
      label: "Identity",
      status: "connected",
      tools: [{ name: "verify_identity", description: "Verify", inputSchema: {} }],
    });
    expect(mcp.toolSpecOf("identity", "verify_identity")?.description).toBe("Verify");
    expect(mcp.toolSpecOf("identity", "nope")).toBeUndefined();
  });

  it("explains why a server isn't usable", () => {
    expect(mcp.statusOf("orders")).toMatchObject({ label: "Orders", error: "spawn failed" });
    expect(mcp.disconnectedReason("orders")).toBe("spawn failed");
    expect(mcp.isConnected("orders")).toBe(false);
    expect(mcp.isConnected("identity")).toBe(true);
  });

  it("runs the local servers from their package folder with tsx", () => {
    const identity = transports.find((t) => t.cwd?.endsWith(path.join("packages", "mcp-identity")));
    expect(identity).toMatchObject({
      command: process.execPath,
      args: ["--import", "tsx", "src/index.ts"],
      stderr: "inherit",
    });
  });

  it("calls a tool on a connected server and times it", async () => {
    const { result, ms } = await mcp.callTool("identity", "verify_identity", {});
    expect(result.content).toEqual([{ type: "text", text: "called verify_identity" }]);
    expect(ms).toBeGreaterThanOrEqual(0);
    await expect(mcp.callTool("orders", "get_order", {})).rejects.toThrow(
      "orders is not connected",
    );
  });

  it("closes every client even when one fails to close", async () => {
    await mcp.closeAll();
    expect(closed).toHaveLength(1);
  });
});
