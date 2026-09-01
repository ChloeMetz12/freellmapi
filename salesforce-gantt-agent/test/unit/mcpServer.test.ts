import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Outcome } from "../../src/workflow/outcomes.js";

const loadEnv = vi.fn();
const addProjectToGantt = vi.fn();
const confirmDispatch = vi.fn();
const connect = vi.fn().mockResolvedValue(undefined);

interface RegisteredTool {
  config: { title: string; description: string; inputSchema: unknown };
  handler: (input: unknown) => Promise<{ content: { type: string; text: string }[] }>;
}
const registeredTools = new Map<string, RegisteredTool>();

vi.mock("../../src/config/env.js", () => ({ loadEnv }));
vi.mock("../../src/workflow/addProjectToGantt.js", () => ({ addProjectToGantt, confirmDispatch }));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool: (name: string, config: RegisteredTool["config"], handler: RegisteredTool["handler"]) => {
      registeredTools.set(name, { config, handler });
    },
    connect,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(),
}));

const fakeEnv = { SF_ORG_URL: "https://x.my.salesforce.com" } as never;
loadEnv.mockReturnValue(fakeEnv);

await import("../../src/mcp/server.js");

describe("mcp/server.ts wiring", () => {
  beforeEach(() => {
    addProjectToGantt.mockReset();
    confirmDispatch.mockReset();
  });

  it("connects a StdioServerTransport exactly once at startup", () => {
    expect(connect).toHaveBeenCalledOnce();
  });

  it("registers both add_gantt_project and confirm_dispatch with a non-empty title/description/inputSchema", () => {
    for (const name of ["add_gantt_project", "confirm_dispatch"]) {
      const tool = registeredTools.get(name);
      expect(tool, `${name} was not registered`).toBeDefined();
      expect(tool!.config.title.length).toBeGreaterThan(0);
      expect(tool!.config.description.length).toBeGreaterThan(0);
      expect(tool!.config.inputSchema).toBeTruthy();
    }
  });

  it("add_gantt_project calls addProjectToGantt with the input and loaded env, returning JSON text content", async () => {
    const outcome: Outcome = { type: "Dispatched", workOrderUrl: "https://x/wo", serviceAppointmentUrl: "https://x/sa", assignedTechnician: "Jane Tech" };
    addProjectToGantt.mockResolvedValue(outcome);
    const input = { projectIdentifier: "Daryl Van Horn", dryRun: true };

    const result = await registeredTools.get("add_gantt_project")!.handler(input);

    expect(addProjectToGantt).toHaveBeenCalledWith(input, fakeEnv);
    expect(result).toEqual({ content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }] });
  });

  it("confirm_dispatch calls confirmDispatch with runId/approve, returning JSON text content", async () => {
    const outcome: Outcome = { type: "Cancelled", runId: "run-1" };
    confirmDispatch.mockResolvedValue(outcome);

    const result = await registeredTools.get("confirm_dispatch")!.handler({ runId: "run-1", approve: false });

    expect(confirmDispatch).toHaveBeenCalledWith("run-1", false);
    expect(result).toEqual({ content: [{ type: "text", text: JSON.stringify(outcome, null, 2) }] });
  });
});
