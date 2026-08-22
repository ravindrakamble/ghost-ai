// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AiArchitectTab, ChatBubble } from "./ai-architect-tab";

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

  it("submits on Enter (without Shift), appending a local user bubble and clearing the input", () => {
    render(<AiArchitectTab />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design an inventory system" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(screen.getByText("Design an inventory system")).toBeInTheDocument();
    expect(textarea.value).toBe("");
    // Empty state is gone now that a message exists.
    expect(screen.queryByText(/describe the system you want to design/i)).not.toBeInTheDocument();
  });

  it("does not submit on Shift+Enter, allowing a newline instead", () => {
    render(<AiArchitectTab />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    // The typed text stays in the textarea only — no chat bubble was
    // appended, proven by the empty state (and its chips) still rendering.
    expect(textarea.value).toBe("line one");
    expect(screen.getByRole("button", { name: "Design an e-commerce backend" })).toBeInTheDocument();
    expect(
      screen.getByText(/describe the system you want to design/i)
    ).toBeInTheDocument();
  });

  it("submits via the Send button and disables it while the input is empty", () => {
    render(<AiArchitectTab />);

    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a chat app" } });
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);
    expect(screen.getByText("Design a chat app")).toBeInTheDocument();
  });

  it("does not submit an empty or whitespace-only message", () => {
    render(<AiArchitectTab />);

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(screen.getByRole("button", { name: "Design an e-commerce backend" })).toBeInTheDocument();
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
  it("renders a user message right-aligned", () => {
    render(<ChatBubble message={{ id: "1", role: "user", content: "Hi there" }} />);

    const bubble = screen.getByText("Hi there");
    const row = bubble.parentElement as HTMLElement;
    expect(row.className).toContain("justify-end");
  });

  it("renders an assistant message left-aligned with the AI text token", () => {
    render(<ChatBubble message={{ id: "2", role: "assistant", content: "Sure, here's a plan" }} />);

    const bubble = screen.getByText("Sure, here's a plan");
    const row = bubble.parentElement as HTMLElement;
    expect(row.className).toContain("justify-start");
    expect(bubble.className).toContain("text-ai-text");
  });
});
