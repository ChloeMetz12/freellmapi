import { describe, expect, it, vi } from "vitest";
import { AccountNotesPage } from "../../src/salesforce/AccountNotesPage.js";
import { RunRecorder } from "../../src/logging/runRecorder.js";
import type { RunContext } from "../../src/types.js";

vi.mock("../../src/logging/screenshots.js", () => ({
  captureScreenshot: vi.fn().mockResolvedValue("fake-screenshot.png"),
}));

function fakeCtx(dryRun: boolean, page: unknown = {}): RunContext {
  return {
    page: page as never,
    dryRun,
    runId: "test-run",
    runDir: "/tmp/does-not-matter",
    logger: { info: vi.fn(), error: vi.fn() } as never,
  };
}

function fakeRecorder() {
  return new RunRecorder("test-run", "/tmp/does-not-matter", { projectIdentifier: "x", dryRun: true }, true);
}

describe("AccountNotesPage.addNote", () => {
  it("never touches the page for a dry-run:// account URL, and records a skipped-dry-run step", async () => {
    const goto = vi.fn();
    const ctx = fakeCtx(true, { goto, getByRole: vi.fn() });
    const recorder = fakeRecorder();

    await new AccountNotesPage(ctx).addNote("dry-run://no-account", "Note text", recorder);

    expect(goto).not.toHaveBeenCalled();
    expect(recorder.current.steps).toHaveLength(1);
    expect(recorder.current.steps[0]).toMatchObject({ step: "add-account-note", outcome: "skipped-dry-run" });
    expect(recorder.current.steps[0].detail).toEqual({ accountUrl: "dry-run://no-account", noteText: "Note text" });
  });

  it("still navigates to a real account URL and opens the Related tab even in dry-run mode (only the note-add itself is guarded)", async () => {
    const click = vi.fn();
    const goto = vi.fn().mockResolvedValue(undefined);
    const getByRole = vi.fn().mockReturnValue({ click });
    const ctx = fakeCtx(true, { goto, getByRole });
    const recorder = fakeRecorder();

    await new AccountNotesPage(ctx).addNote("https://x.my.salesforce.com/account/001", "Note text", recorder);

    expect(goto).toHaveBeenCalledWith("https://x.my.salesforce.com/account/001");
    expect(click).toHaveBeenCalledOnce();
    // The actual note-creation click/fill/save is still guarded and skipped.
    expect(recorder.current.steps[0].outcome).toBe("skipped-dry-run");
  });

  it("performs the real note-add sequence in live mode", async () => {
    const relatedTabClick = vi.fn();
    const newNoteClick = vi.fn();
    const textboxFill = vi.fn();
    const saveClick = vi.fn();
    const getByRole = vi.fn((role: string, opts?: { name?: unknown }) => {
      if (role === "textbox") return { fill: textboxFill };
      const name = opts?.name ? String(opts.name) : "";
      if (role === "tab" && name === "Related") return { click: relatedTabClick };
      if (role === "button" && name === "New Note") return { click: newNoteClick };
      if (role === "button" && /save/i.test(name)) return { click: saveClick };
      throw new Error(`Unexpected getByRole call: ${role} / ${name}`);
    });
    const ctx = fakeCtx(false, { goto: vi.fn().mockResolvedValue(undefined), getByRole });
    const recorder = fakeRecorder();

    await new AccountNotesPage(ctx).addNote("https://x.my.salesforce.com/account/001", "Note text", recorder);

    expect(relatedTabClick).toHaveBeenCalledOnce();
    expect(newNoteClick).toHaveBeenCalledOnce();
    expect(textboxFill).toHaveBeenCalledWith("Note text");
    expect(saveClick).toHaveBeenCalledOnce();
    expect(recorder.current.steps[0].outcome).toBe("ok");
  });
});
