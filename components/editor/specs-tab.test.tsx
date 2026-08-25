// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SpecsTab } from "./specs-tab";
import type { CanvasEdge, CanvasNode } from "@/types/canvas";
import type { AiChatMessage } from "@/types/tasks";

// `useRealtimeRun` (spec 30, `@trigger.dev/react-hooks`) is mocked so this
// file can deterministically drive the run's `id`/`isCompleted`/`isSuccess`/
// `error` shape across renders without a real Trigger.dev subscription —
// same convention `ai-architect-tab.test.tsx` already established for the
// design agent's own two-call sequence.
const { useRealtimeRunMock } = vi.hoisted(() => ({
  useRealtimeRunMock: vi.fn(),
}));

vi.mock("@trigger.dev/react-hooks", () => ({
  useRealtimeRun: useRealtimeRunMock,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  useRealtimeRunMock.mockReset();
  useRealtimeRunMock.mockReturnValue({ run: undefined, error: undefined, stop: vi.fn() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

const SPECS = [
  { id: "s1", filename: "spec-s1.md", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "s2", filename: "spec-s2.md", createdAt: "2026-01-02T00:00:00.000Z" },
];

const NODES: CanvasNode[] = [
  {
    id: "n1",
    type: "canvasNode",
    position: { x: 5, y: 10 },
    data: { label: "API", color: "#1F1F1F", textColor: "#EDEDED", shape: "rectangle" },
  },
];

const EDGES: CanvasEdge[] = [
  { id: "e1", type: "canvasEdge", source: "n1", target: "n2", data: { label: "calls" } },
];

const CHAT_MESSAGES: AiChatMessage[] = [
  { id: "1", sender: "Ada", role: "user", content: "Design an inventory system", timestamp: 1700000000000 },
];

/**
 * Every fetch call not aimed at `/api/ai/spec*` resolves as the spec list
 * route (empty list, `ok: true`), so `useProjectSpecs`'s own mount fetch
 * (and any `refetch()` call this spec's own tests exercise) always succeeds
 * without needing a per-test stub.
 */
function stubGenerateSpecFlow(overrides: {
  specResponse?: Response;
  tokenResponse?: Response;
} = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/ai/spec") {
      return Promise.resolve(overrides.specResponse ?? jsonResponse(true, { runId: "run-1" }));
    }
    if (url === "/api/ai/spec/token") {
      return Promise.resolve(overrides.tokenResponse ?? jsonResponse(true, { token: "token-1" }));
    }
    return Promise.resolve(jsonResponse(true, { specs: SPECS }));
  });
}

describe("SpecsTab", () => {
  it("renders an enabled-looking Generate Spec button, unchanged from spec 20", () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: [] }));
    render(<SpecsTab projectId="p1" />);

    const generateButton = screen.getByRole("button", { name: /generate spec/i });
    expect(generateButton).not.toBeDisabled();
  });

  it("fetches the spec list for the given project on mount", () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: [] }));
    render(<SpecsTab projectId="p1" />);

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/specs");
  });

  it("shows a loading state, then renders one item per fetched spec with its filename and createdAt", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: SPECS }));
    render(<SpecsTab projectId="p1" />);

    expect(screen.getByText(/loading specs/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("spec-s1.md")).toBeInTheDocument());
    expect(screen.getByText("spec-s2.md")).toBeInTheDocument();
  });

  it("shows an empty state when the project has no specs", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: [] }));
    render(<SpecsTab projectId="p1" />);

    expect(await screen.findByText(/no specs generated yet/i)).toBeInTheDocument();
  });

  it("shows an inline error with a retry action when the list fails to load", async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { error: "Forbidden" }));
    render(<SpecsTab projectId="p1" />);

    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("opens the preview modal when a list item is clicked", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: SPECS }));
    render(<SpecsTab projectId="p1" />);

    await waitFor(() => expect(screen.getByText("spec-s1.md")).toBeInTheDocument());

    fetchMock.mockResolvedValueOnce(jsonResponse(true, { specs: SPECS })); // not used again
    fireEvent.click(screen.getByText("spec-s1.md"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/specs/s1/download");
  });

  it("renders a real <a href download> download action for each list item", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: SPECS }));
    render(<SpecsTab projectId="p1" />);

    await waitFor(() => expect(screen.getByText("spec-s1.md")).toBeInTheDocument());

    const downloadLinks = screen.getAllByRole("link", { name: /download/i });
    expect(downloadLinks).toHaveLength(2);
    expect(downloadLinks[0]).toHaveAttribute("href", "/api/projects/p1/specs/s1/download");
    expect(downloadLinks[0]).toHaveAttribute("download");
  });

  it("uses only token-based classes, no raw hex or Tailwind color classes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: SPECS }));
    const { container } = render(<SpecsTab projectId="p1" />);
    await waitFor(() => expect(screen.getByText("spec-s1.md")).toBeInTheDocument());

    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(html).not.toMatch(/\b(?:bg|text|border)-(?:white|black|zinc|gray|slate)-?\d*\b/);
  });
});

describe("SpecsTab — Download as Terraform (spec 35)", () => {
  const SPECS_WITH_MIXED_IAC = [
    { id: "s1", filename: "spec-s1.md", createdAt: "2026-01-01T00:00:00.000Z", hasIac: true },
    { id: "s2", filename: "spec-s2.md", createdAt: "2026-01-02T00:00:00.000Z", hasIac: false },
  ];

  it("renders a working <a href download> Terraform download action when hasIac is true", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: SPECS_WITH_MIXED_IAC }));
    render(<SpecsTab projectId="p1" />);

    await waitFor(() => expect(screen.getByText("spec-s1.md")).toBeInTheDocument());

    const terraformLink = screen.getByRole("link", { name: /download spec-s1\.md as terraform/i });
    expect(terraformLink).toHaveAttribute(
      "href",
      "/api/projects/p1/specs/s1/download-iac",
    );
    expect(terraformLink).toHaveAttribute("download");
  });

  it("renders a visibly-present but disabled control (not a live link) when hasIac is false", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: SPECS_WITH_MIXED_IAC }));
    render(<SpecsTab projectId="p1" />);

    await waitFor(() => expect(screen.getByText("spec-s2.md")).toBeInTheDocument());

    expect(
      screen.queryByRole("link", { name: /download spec-s2\.md as terraform/i }),
    ).not.toBeInTheDocument();
    const disabledButton = screen.getByRole("button", { name: /download spec-s2\.md as terraform/i });
    expect(disabledButton).toBeDisabled();
  });
});

describe("SpecsTab — Generate Spec (spec 30)", () => {
  it("converts nodes/edges/chatMessages and POSTs /api/ai/spec with { roomId, chatHistory, nodes, edges }", async () => {
    stubGenerateSpecFlow();
    render(
      <SpecsTab projectId="p1" nodes={NODES} edges={EDGES} chatMessages={CHAT_MESSAGES} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));

    await waitFor(() => {
      const specCall = fetchMock.mock.calls.find(([url]) => url === "/api/ai/spec");
      expect(specCall).toBeDefined();
    });

    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/ai/spec") as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      roomId: "p1",
      chatHistory: CHAT_MESSAGES,
      nodes: [{ id: "n1", label: "API", shape: "rectangle", x: 5, y: 10 }],
      edges: [{ id: "e1", sourceNodeId: "n1", targetNodeId: "n2", label: "calls" }],
    });
  });

  it("calls POST /api/ai/spec/token with { runId } after a successful POST /api/ai/spec, then subscribes via useRealtimeRun", async () => {
    stubGenerateSpecFlow();
    render(<SpecsTab projectId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));

    await waitFor(() => {
      const tokenCall = fetchMock.mock.calls.find(([url]) => url === "/api/ai/spec/token");
      expect(tokenCall).toBeDefined();
    });
    const [, tokenInit] = fetchMock.mock.calls.find(([url]) => url === "/api/ai/spec/token") as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(tokenInit.body as string)).toEqual({ runId: "run-1" });

    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ accessToken: "token-1", enabled: true }),
      );
    });
  });

  it("disables the button and shows a spinner immediately on click, before the two POSTs settle", () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<SpecsTab projectId="p1" />);

    const button = screen.getByRole("button", { name: /generate spec/i });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("keeps the button disabled/busy while the triggered run is in flight, until useRealtimeRun reports a terminal state", async () => {
    stubGenerateSpecFlow();
    render(<SpecsTab projectId="p1" />);

    const button = screen.getByRole("button", { name: /generate spec/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ accessToken: "token-1", enabled: true }),
      );
    });
    expect(button).toBeDisabled();
  });

  it("calls useProjectSpecs's refetch and clears runId/publicToken once the run completes successfully", async () => {
    stubGenerateSpecFlow();
    const { rerender } = render(<SpecsTab projectId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));

    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ accessToken: "token-1", enabled: true }),
      );
    });

    const specsListCallsBefore = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/projects/p1/specs",
    ).length;

    useRealtimeRunMock.mockReturnValue({
      run: { id: "run-1", isCompleted: true, isSuccess: true, isFailed: false, error: undefined },
      error: undefined,
      stop: vi.fn(),
    });
    rerender(<SpecsTab projectId="p1" />);

    // refetch() re-fetches the spec list — a new call to the same route.
    await waitFor(() => {
      const specsListCallsAfter = fetchMock.mock.calls.filter(
        ([url]) => url === "/api/projects/p1/specs",
      ).length;
      expect(specsListCallsAfter).toBeGreaterThan(specsListCallsBefore);
    });

    // Local run state is cleared — a subsequent useRealtimeRun call reverts
    // to a disabled, no-runId subscription.
    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({ accessToken: undefined, enabled: false }),
      );
    });

    // Button is no longer busy.
    expect(screen.getByRole("button", { name: /generate spec/i })).not.toBeDisabled();
    expect(screen.queryByText(/failed to generate a spec/i)).not.toBeInTheDocument();
  });

  it("shows an inline error (with the run's own error detail) when the run reaches a failed/errored terminal state, and clears local run state", async () => {
    stubGenerateSpecFlow();
    const { rerender } = render(<SpecsTab projectId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));

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
    rerender(<SpecsTab projectId="p1" />);

    expect(await screen.findByText(/gemini timed out/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({ accessToken: undefined, enabled: false }),
      );
    });
    expect(screen.getByRole("button", { name: /generate spec/i })).not.toBeDisabled();
  });

  it("shows an inline error (no run detail, no token exchange attempted) when the initial POST /api/ai/spec fails", async () => {
    stubGenerateSpecFlow({ specResponse: jsonResponse(false, {}) });
    render(<SpecsTab projectId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));

    expect(await screen.findByText(/failed to generate a spec/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.find(([url]) => url === "/api/ai/spec/token")).toBeUndefined();
    expect(useRealtimeRunMock).not.toHaveBeenCalledWith("run-1", expect.anything());
    expect(screen.getByRole("button", { name: /generate spec/i })).not.toBeDisabled();
  });

  it("shows an inline error when POST /api/ai/spec/token fails after a runId was already obtained", async () => {
    stubGenerateSpecFlow({ tokenResponse: jsonResponse(false, {}) });
    render(<SpecsTab projectId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));

    expect(await screen.findByText(/failed to generate a spec/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(useRealtimeRunMock).toHaveBeenLastCalledWith(
        undefined,
        expect.objectContaining({ enabled: false }),
      );
    });
  });

  it("clears a stale error once a fresh Generate Spec click is made", async () => {
    stubGenerateSpecFlow({ specResponse: jsonResponse(false, {}) });
    render(<SpecsTab projectId="p1" />);

    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));
    expect(await screen.findByText(/failed to generate a spec/i)).toBeInTheDocument();

    stubGenerateSpecFlow();
    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));

    await waitFor(() => {
      expect(screen.queryByText(/failed to generate a spec/i)).not.toBeInTheDocument();
    });
  });

  it("does not disable or dim the existing spec list, preview, or download actions while a run is in flight", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/ai/spec") return new Promise(() => {}); // never resolves
      return Promise.resolve(jsonResponse(true, { specs: SPECS }));
    });
    render(<SpecsTab projectId="p1" />);

    await waitFor(() => expect(screen.getByText("spec-s1.md")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /generate spec/i }));

    expect(screen.getByRole("button", { name: /generate spec/i })).toBeDisabled();
    // The rest of the tab stays fully interactive.
    const downloadLinks = screen.getAllByRole("link", { name: /download/i });
    expect(downloadLinks[0]).not.toHaveAttribute("aria-disabled");
    fireEvent.click(screen.getByText("spec-s1.md"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
