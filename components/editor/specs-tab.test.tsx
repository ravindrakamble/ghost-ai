// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SpecsTab } from "./specs-tab";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
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
