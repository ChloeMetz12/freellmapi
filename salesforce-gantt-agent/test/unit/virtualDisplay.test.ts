import { describe, expect, it, vi, afterEach } from "vitest";
import { startVirtualDisplay } from "../../src/display/virtualDisplay.js";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform });
}

afterEach(() => {
  setPlatform(originalPlatform);
  spawn.mockReset();
});

describe("startVirtualDisplay on non-Linux platforms", () => {
  it("does not spawn Xvfb on macOS -- there's already a real display", async () => {
    setPlatform("darwin");

    const display = await startVirtualDisplay({ width: 1440, height: 900 });

    expect(spawn).not.toHaveBeenCalled();
    expect(display.display).toBe("");
    expect(() => display.stop()).not.toThrow();
  });

  it("does not spawn Xvfb on Windows either", async () => {
    setPlatform("win32");

    await startVirtualDisplay({ width: 1440, height: 900 });

    expect(spawn).not.toHaveBeenCalled();
  });
});
