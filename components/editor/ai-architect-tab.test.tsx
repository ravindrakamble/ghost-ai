// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AiArchitectTab, ChatBubble } from "./ai-architect-tab";
import type { AiChatMessage } from "@/types/tasks";

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

  it("submits via Enter (without Shift), calling sendMessage with the trimmed content and clearing the input on success", () => {
    const sendMessage = vi.fn();
    render(<AiArchitectTab sendMessage={sendMessage} />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "  Design an inventory system  " } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(sendMessage).toHaveBeenCalledWith("Design an inventory system");
    expect(textarea.value).toBe("");
    expect(screen.queryByText(/failed to send/i)).not.toBeInTheDocument();
  });

  it("submits via the Send button and disables it while the input is empty", () => {
    const sendMessage = vi.fn();
    render(<AiArchitectTab sendMessage={sendMessage} />);

    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a chat app" } });
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);
    expect(sendMessage).toHaveBeenCalledWith("Design a chat app");
  });

  it("preserves the input and shows an inline error indicator when sendMessage throws (failed send)", () => {
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
