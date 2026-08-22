// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiSidebar } from "./ai-sidebar";

// `AiArchitectTab` (spec 26) imports `useRealtimeRun` from
// `@trigger.dev/react-hooks` — mocked here for the same reason
// `ai-architect-tab.test.tsx` mocks it: this file's tests care about prop
// *forwarding*, not the real Trigger.dev subscription's own behavior.
const { useRealtimeRunMock } = vi.hoisted(() => ({
  useRealtimeRunMock: vi.fn(),
}));

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: useRealtimeRunMock,
}));

beforeEach(() => {
  useRealtimeRunMock.mockReset();
  useRealtimeRunMock.mockReturnValue({ run: undefined, error: undefined, stop: vi.fn() });
  // Fails closed by default (no `runId` field) — a submit triggered by these
  // tests exercises `AiArchitectTab`'s real design-agent submit flow (spec
  // 26) without ever reaching a real, enabled `useRealtimeRun` subscription.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiSidebar", () => {
  it("renders the header (bot icon, title, subtitle) and preserves the floating/slide/border treatment", () => {
    render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("AI Workspace")).toBeInTheDocument();
    expect(screen.getByText("Collaborate with Ghost AI")).toBeInTheDocument();

    const aside = screen.getByText("AI Workspace").closest("aside") as HTMLElement;
    expect(aside.className).toContain("absolute");
    expect(aside.className).toContain("top-0");
    expect(aside.className).toContain("right-0");
    expect(aside.className).toContain("h-full");
    expect(aside.className).toContain("w-80");
    expect(aside.className).toContain("border-l");
    expect(aside.className).toContain("border-surface-border");
    expect(aside.className).toContain("bg-elevated/95");
    expect(aside.className).toContain("backdrop-blur");
    expect(aside.className).toContain("duration-200");
    expect(aside.className).toContain("ease-in-out");
    expect(aside.className).toContain("translate-x-0");
    expect(aside).toHaveAttribute("aria-hidden", "false");
  });

  it("reflects isOpen via translate transform and aria-hidden when closed", () => {
    render(
      <AiSidebar
        isOpen={false}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );

    const aside = screen.getByText("AI Workspace").closest("aside") as HTMLElement;
    expect(aside.className).toContain("translate-x-full");
    expect(aside).toHaveAttribute("aria-hidden", "true");
  });

  it("calls onClose when the header close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <AiSidebar
        isOpen={true}
        onClose={onClose}
        projectId="p1"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /close ai sidebar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders exactly two tabs, AI Architect and Specs, with AI Architect active by default", () => {
    render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent("AI Architect");
    expect(tabs[1]).toHaveTextContent("Specs");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });

  it("switches to the Specs tab content on click, distinguishing the active tab via tokens", () => {
    render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );

    const architectTab = screen.getByRole("tab", { name: "AI Architect" });
    const specsTab = screen.getByRole("tab", { name: "Specs" });
    fireEvent.click(specsTab);

    expect(specsTab).toHaveAttribute("aria-selected", "true");
    // Regression coverage for the QA-reported bug: the active/inactive
    // pairing must be applied via the SAME modifier prefixes
    // `components/ui/tabs.tsx`'s own base classes use — both plain
    // `data-active:` (vs. the base's `data-active:bg-background
    // data-active:text-foreground`) AND `dark:data-active:` (vs. the base's
    // `dark:data-active:bg-input/30 dark:data-active:text-foreground`, which
    // this app's always-on `.dark` class on `<html>` makes just as live as
    // the plain pair) — otherwise tailwind-merge doesn't treat the override
    // as being in the same conflict group and the base's rule(s) silently
    // win the cascade instead, exactly as QA verified via real computed
    // styles in a built + Playwright-rendered page.
    expect(specsTab.className).toContain("data-active:bg-accent-dim");
    expect(specsTab.className).toContain("data-active:text-brand");
    expect(specsTab.className).toContain("dark:data-active:bg-accent-dim");
    expect(specsTab.className).toContain("dark:data-active:text-brand");
    // Base UI actually sets the `data-active` attribute on the selected tab
    // (and only the selected tab) — confirms the selector these classes key
    // off actually matches the real DOM state, not just a string in className.
    expect(specsTab).toHaveAttribute("data-active");
    expect(architectTab).not.toHaveAttribute("data-active");
    expect(screen.getByRole("button", { name: /generate spec/i })).toBeInTheDocument();
  });

  it("has no Liveblocks or Trigger.dev references anywhere in its rendered output", () => {
    const { container } = render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );
    const html = container.innerHTML;

    expect(html).not.toMatch(/liveblocks/i);
    expect(html).not.toMatch(/trigger\.dev/i);
  });

  it("forwards aiStatus straight through to AiArchitectTab (spec 24)", () => {
    render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={{ stage: "processing", text: "Designing…" }}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("Designing…")).toBeInTheDocument();
    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    expect(textarea).toBeDisabled();
  });

  it("does not dim or block tab switching or the close button while a run is active", () => {
    render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={{ stage: "start", text: "Working…" }}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );

    const specsTab = screen.getByRole("tab", { name: "Specs" });
    fireEvent.click(specsTab);
    expect(specsTab).toHaveAttribute("aria-selected", "true");

    expect(screen.getByRole("button", { name: /close ai sidebar/i })).not.toBeDisabled();
  });

  it("forwards chatMessages straight through to AiArchitectTab (spec 25)", () => {
    render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={null}
        chatMessages={[
          { id: "1", sender: "Ada", role: "user", content: "Hello Ghost AI", timestamp: 1700000000000 },
        ]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("Hello Ghost AI")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  it("forwards sendChatMessage straight through to AiArchitectTab, called with the trimmed input on submit (spec 25)", async () => {
    const sendChatMessage = vi.fn();
    render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={sendChatMessage}
        sendAgentMessage={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(sendChatMessage).toHaveBeenCalledWith("Design a queue");

    // Let the (stubbed, failing-closed) spec-26 design-agent submit flow
    // settle so no state update happens after this test's own teardown.
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
  });

  it("forwards projectId into AiArchitectTab's POST /api/ai/design body (spec 26)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="proj-99"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText(/message ghost ai/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Design a queue" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ roomId: "proj-99", projectId: "proj-99" });
  });

  it("forwards sendAgentMessage straight through to AiArchitectTab, called once its own triggered run completes (spec 26)", async () => {
    const sendAgentMessage = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ runId: "run-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "token-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
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
      run: { id: "run-1", isCompleted: true, isSuccess: true, error: undefined },
      error: undefined,
      stop: vi.fn(),
    });
    rerender(
      <AiSidebar
        isOpen={true}
        onClose={vi.fn()}
        projectId="p1"
        aiStatus={null}
        chatMessages={[]}
        sendChatMessage={vi.fn()}
        sendAgentMessage={sendAgentMessage}
      />,
    );

    await waitFor(() => {
      expect(sendAgentMessage).toHaveBeenCalledWith(expect.stringContaining("updated the canvas"));
    });
  });
});
