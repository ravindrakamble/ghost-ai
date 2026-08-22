// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiArchitectTab, ChatBubble } from "./ai-architect-tab";
import type { AiChatMessage } from "@/types/tasks";

// `useRealtimeRun` (spec 26, `@trigger.dev/react-hooks`) is mocked so this
// file can deterministically drive the run's `id`/`isCompleted`/`isSuccess`/
// `error` shape across renders without a real Trigger.dev subscription
// (which would attempt a genuine network call the moment `enabled` becomes
// `true`). Matches this codebase's established "mock the SDK boundary,
// verify wiring" convention (e.g. `canvas.test.tsx`'s Liveblocks mocks).
const { useRealtimeRunMock } = vi.hoisted(() => ({
  useRealtimeRunMock: vi.fn(),
}));

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: useRealtimeRunMock,
}));

function makeMessage(overrides: Partial<AiChatMessage> = {}): AiChatMessage {
  return {
    id: "msg-1",
    sender: "Ada",
    role: "user",
    content: "Design an inventory system",
    timestamp: Date.UTC(2026, 0, 1, 12, 0),
    ...overrides,
  };
}

beforeEach(() => {
  useRealtimeRunMock.mockReset();
  useRealtimeRunMock.mockReturnValue({ run: undefined, error: undefined, stop: vi.fn() });
  // Default: every fetch fails closed (no `runId`/`token` field) so tests
  // that don't care about the design-agent submit flow still exercise it
  // (since a successful `sendMessage` always triggers it) without ever
  // reaching a real `runId`/enabled `useRealtimeRun` subscription.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiArchitectTab", () => {
  it("shows the empty state with the three exact starter prompt chips when there are no messages", () => {
    render(<AiArchitectTab />);

    expect(
      screen.getByText(/describe the system you want to design/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Design an e-commerce backend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create a chat app architecture" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build a CI/CD pipeline" })).toBeInTheDocument();
  });

  it("fills the textarea (without submitting) when a starter chip is clicked", () => {
    render(<AiArchitectTab />);

    fireEvent.click(screen.getByRole("button", { name: "Build a CI/CD pipeline" }));

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Build a CI/CD pipeline");
    // Filling doesn't auto-submit — empty state (and its chips) is still there.
    expect(screen.getByRole("button", { name: "Build a CI/CD pipeline" })).toBeInTheDocument();
  });

  it("does not submit on Shift+Enter, allowing a newline instead", () => {
    const sendMessage = vi.fn();
    render(<AiArchitectTab sendMessage={sendMessage} />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    // The typed text stays in the textarea only — no send call was made.
    expect(textarea.value).toBe("line one");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not submit an empty or whitespace-only message", () => {
    const sendMessage = vi.fn();
    render(<AiArchitectTab sendMessage={sendMessage} />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("AiArchitectTab — chatMessages/sendMessage (spec 25)", () => {
  it("renders every persisted message in order, showing sender/timestamp/content", () => {
    const messages: AiChatMessage[] = [
      makeMessage({ id: "1", sender: "Ada", content: "First message" }),
      makeMessage({ id: "2", sender: "Bot", role: "assistant", content: "Second message" }),
    ];

    render(<AiArchitectTab chatMessages={messages} />);

    const rendered = screen.getAllByText(/^(First|Second) message$/).map((node) => node.textContent);
    expect(rendered).toEqual(["First message", "Second message"]);
    expect(screen.getAllByText("Ada")).toHaveLength(1);
    expect(screen.getAllByText("Bot")).toHaveLength(1);
    // Empty state is gone once real messages exist.
    expect(screen.queryByText(/describe the system you want to design/i)).not.toBeInTheDocument();
  });

  it("submits via Enter (without Shift), calling sendMessage with the trimmed content and clearing the input on success", async () => {
    const sendMessage = vi.fn();
    render(<AiArchitectTab sendMessage={sendMessage} />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "  Design an inventory system  " } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(sendMessage).toHaveBeenCalledWith("Design an inventory system");
    expect(textarea.value).toBe("");
    expect(screen.queryByText(/failed to send/i)).not.toBeInTheDocument();

    // Let the (stubbed, failing-closed) design-agent submit flow settle so
    // no state update happens after this test's own teardown.
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it("submits via the Send button and disables it while the input is empty", async () => {
    const sendMessage = vi.fn();
    render(<AiArchitectTab sendMessage={sendMessage} />);

    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a chat app" } });
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);
    expect(sendMessage).toHaveBeenCalledWith("Design a chat app");

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it("preserves the input and shows an inline error indicator when sendMessage throws (failed send), never starting a design request", () => {
    const sendMessage = vi.fn(() => {
      throw new Error("boom");
    });
    render(<AiArchitectTab sendMessage={sendMessage} />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a CDN" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(sendMessage).toHaveBeenCalledWith("Design a CDN");
    // Input is preserved, not cleared.
    expect(textarea.value).toBe("Design a CDN");
    expect(screen.getByText(/failed to send/i)).toBeInTheDocument();
    // The design-agent submit flow never starts if the prompt couldn't even
    // be recorded in ai-chat.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("clears a stale error indicator once the user edits the input again", () => {
    const sendMessage = vi.fn(() => {
      throw new Error("boom");
    });
    render(<AiArchitectTab sendMessage={sendMessage} />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a CDN" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(screen.getByText(/failed to send/i)).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "Design a CDN v2" } });
    expect(screen.queryByText(/failed to send/i)).not.toBeInTheDocument();
  });

  it("throws (and shows the failure state) when no sendMessage prop is wired up yet", () => {
    render(<AiArchitectTab />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("Design a queue");
    expect(screen.getByText(/failed to send/i)).toBeInTheDocument();
  });
});

describe("AiArchitectTab — aiStatus (spec 24)", () => {
  it("renders no status line and an enabled Send-icon button when aiStatus is null/absent", () => {
    render(<AiArchitectTab />);

    expect(screen.queryByText(/ghost ai is working/i)).not.toBeInTheDocument();
    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton.querySelector("svg.animate-spin")).not.toBeInTheDocument();
  });

  it.each(["start", "processing"] as const)(
    "shows the status line, disables the textarea/Send button, and swaps to a spinner while stage is %s",
    (stage) => {
      render(<AiArchitectTab aiStatus={{ stage, text: "Designing your system…" }} />);

      expect(screen.getByText("Designing your system…")).toBeInTheDocument();

      const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
      expect(textarea).toBeDisabled();

      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toBeDisabled();
      expect(sendButton.querySelector("svg.animate-spin")).toBeInTheDocument();
    },
  );

  it.each(["complete", "error"] as const)(
    "shows no status line and re-enables the input once stage reaches %s",
    (stage) => {
      render(<AiArchitectTab aiStatus={{ stage, text: "Done" }} />);

      expect(screen.queryByText("Done")).not.toBeInTheDocument();

      const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
      expect(textarea).not.toBeDisabled();

      // Still subject to the pre-existing empty-input disabled rule.
      const sendButton = screen.getByRole("button", { name: /send message/i });
      expect(sendButton).toBeDisabled();

      fireEvent.change(textarea, { target: { value: "Design a CDN" } });
      expect(sendButton).not.toBeDisabled();
      expect(sendButton.querySelector("svg.animate-spin")).not.toBeInTheDocument();
    },
  );

  it("falls back to default status text when aiStatus.text is omitted (valid per the optional schema)", () => {
    render(<AiArchitectTab aiStatus={{ stage: "start" }} />);

    expect(screen.getByText("Ghost AI is working…")).toBeInTheDocument();
  });

  it("does not disable or dim starter chips, the message list, or anything outside the input row while generating", () => {
    render(<AiArchitectTab aiStatus={{ stage: "processing", text: "Working…" }} />);

    const chip = screen.getByRole("button", { name: "Design an e-commerce backend" });
    expect(chip).not.toBeDisabled();
  });
});

describe("AiArchitectTab — design agent submission (spec 26)", () => {
  it("calls POST /api/ai/design with { prompt, roomId, projectId } then POST /api/ai/design/token with { runId }, in sequence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runId: "run-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "token-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<AiArchitectTab projectId="proj-1" sendMessage={vi.fn()} />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design an inventory system" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [designUrl, designInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(designUrl).toBe("/api/ai/design");
    expect(designInit.method).toBe("POST");
    expect(JSON.parse(designInit.body as string)).toEqual({
      prompt: "Design an inventory system",
      roomId: "proj-1",
      projectId: "proj-1",
    });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(tokenUrl).toBe("/api/ai/design/token");
    expect(tokenInit.method).toBe("POST");
    expect(JSON.parse(tokenInit.body as string)).toEqual({ runId: "run-1" });
  });

  it("disables the textarea/Send button and shows a spinner immediately on submit, before any ai-status-feed broadcast", () => {
    // A never-resolving fetch simulates the window between submission and
    // the two POSTs actually settling — `aiStatus` stays null throughout
    // (no broadcast observed yet), the same real-world gap this spec closes.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<AiArchitectTab projectId="proj-1" sendMessage={vi.fn()} />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea).toBeDisabled();
    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();
    expect(sendButton.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("calls useRealtimeRun with the obtained runId/publicToken, enabled once both are known", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runId: "run-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "token-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<AiArchitectTab projectId="proj-1" sendMessage={vi.fn()} />);

    // Before submitting, useRealtimeRun is called with no runId and disabled.
    expect(useRealtimeRunMock).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ accessToken: undefined, enabled: false }),
    );

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ accessToken: "token-1", enabled: true }),
      );
    });
  });

  it("pushes an AI-authored success message and re-enables the input once useRealtimeRun reports the run completed successfully", async () => {
    const sendAgentMessage = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runId: "run-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "token-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <AiArchitectTab
        projectId="proj-1"
        sendMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ accessToken: "token-1", enabled: true }),
      );
    });
    expect(textarea).toBeDisabled();

    useRealtimeRunMock.mockReturnValue({
      run: { id: "run-1", isCompleted: true, isSuccess: true, isFailed: false, error: undefined },
      error: undefined,
      stop: vi.fn(),
    });
    rerender(
      <AiArchitectTab
        projectId="proj-1"
        sendMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );

    await waitFor(() => {
      expect(sendAgentMessage).toHaveBeenCalledWith(
        expect.stringContaining("updated the canvas"),
      );
    });

    // The run is settled (`run.id === runId && run.isCompleted`) — the
    // input/Send button are no longer busy, and local `runId`/`publicToken`
    // state is cleared, so `useRealtimeRun` returns to a disabled,
    // no-runId subscription.
    expect(textarea).not.toBeDisabled();
    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({ accessToken: undefined, enabled: false }),
      );
    });
  });

  it("only pushes the success message once per run, even if the component re-renders again with the same settled run", async () => {
    const sendAgentMessage = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runId: "run-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "token-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <AiArchitectTab
        projectId="proj-1"
        sendMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ accessToken: "token-1", enabled: true }),
      );
    });

    const settledRun = { id: "run-1", isCompleted: true, isSuccess: true, error: undefined };
    useRealtimeRunMock.mockReturnValue({ run: settledRun, error: undefined, stop: vi.fn() });
    rerender(
      <AiArchitectTab
        projectId="proj-1"
        sendMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );
    await waitFor(() => expect(sendAgentMessage).toHaveBeenCalledTimes(1));

    // A further re-render with the exact same settled run object must not
    // push a second message.
    rerender(
      <AiArchitectTab
        projectId="proj-1"
        sendMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );
    expect(sendAgentMessage).toHaveBeenCalledTimes(1);
  });

  it("pushes an error message (including the run's own error detail) when useRealtimeRun reports a failed/errored terminal state", async () => {
    const sendAgentMessage = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runId: "run-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "token-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <AiArchitectTab
        projectId="proj-1"
        sendMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ accessToken: "token-1", enabled: true }),
      );
    });

    useRealtimeRunMock.mockReturnValue({
      run: {
        id: "run-1",
        isCompleted: true,
        isSuccess: false,
        isFailed: true,
        error: { message: "Gemini timed out" },
      },
      error: undefined,
      stop: vi.fn(),
    });
    rerender(
      <AiArchitectTab
        projectId="proj-1"
        sendMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );

    await waitFor(() => {
      expect(sendAgentMessage).toHaveBeenCalledWith(expect.stringContaining("Gemini timed out"));
    });

    // Local `runId`/`publicToken` state is cleared on the failure path too,
    // the same way the success path clears it.
    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({ accessToken: undefined, enabled: false }),
      );
    });
  });

  it("pushes an error message (no detail) when the initial POST /api/ai/design call fails, without ever enabling useRealtimeRun", async () => {
    const sendAgentMessage = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AiArchitectTab
        projectId="proj-1"
        sendMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(sendAgentMessage).toHaveBeenCalledWith(
        expect.stringContaining("something went wrong"),
      );
    });

    // Only the first POST was ever attempted — no token exchange, no
    // useRealtimeRun subscription ever enabled.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useRealtimeRunMock).not.toHaveBeenCalledWith(
      "run-1",
      expect.anything(),
    );
  });

  it("pushes an error message when POST /api/ai/design/token fails after a runId was already obtained", async () => {
    const sendAgentMessage = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runId: "run-1" }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AiArchitectTab
        projectId="proj-1"
        sendMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(sendAgentMessage).toHaveBeenCalledWith(
        expect.stringContaining("something went wrong"),
      );
    });

    // Re-enabled to false afterward — no lingering enabled subscription.
    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({ enabled: false }),
      );
    });
  });

  it("does not throw when sendAgentMessage itself fails (default not-ready stub), swallowing the secondary failure", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<AiArchitectTab projectId="proj-1" sendMessage={vi.fn()} />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());

    consoleErrorSpy.mockRestore();
  });
});

describe("ChatBubble", () => {
  it("renders a user message right-aligned with sender/timestamp/content", () => {
    render(<ChatBubble message={makeMessage({ role: "user", sender: "Ada", content: "Hi there" })} />);

    const bubble = screen.getByText("Hi there").closest("div")?.parentElement as HTMLElement;
    expect(bubble.className).toContain("justify-end");
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Hi there")).toBeInTheDocument();
  });

  it("renders an assistant message left-aligned with the AI text token", () => {
    render(
      <ChatBubble
        message={makeMessage({ role: "assistant", sender: "Ghost AI", content: "Sure, here's a plan" })}
      />,
    );

    const contentEl = screen.getByText("Sure, here's a plan");
    const bubble = contentEl.closest("div")?.parentElement as HTMLElement;
    expect(bubble.className).toContain("justify-start");
    expect(bubble.querySelector(".text-ai-text")).not.toBeNull();
  });

  it("shows a formatted (non-empty) timestamp string", () => {
    render(<ChatBubble message={makeMessage({ timestamp: Date.UTC(2026, 0, 1, 12, 0) })} />);

    // Exact format is locale/timezone-dependent (see the component's own
    // docblock) — only assert something time-like rendered, not an exact
    // clock value.
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument();
  });
});
