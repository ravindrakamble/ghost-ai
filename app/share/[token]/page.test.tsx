// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getPublicProjectDataMock, notFoundMock } = vi.hoisted(() => ({
  getPublicProjectDataMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  }),
}));

vi.mock("@/lib/public-project", () => ({
  getPublicProjectData: getPublicProjectDataMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/components/editor/public-canvas-preview", () => ({
  PublicCanvasPreview: ({ nodes, edges }: { nodes: unknown[]; edges: unknown[] }) => (
    <div data-testid="public-canvas-preview" data-node-count={nodes.length} data-edge-count={edges.length} />
  ),
}));

vi.mock("@/components/editor/public-spec-view", () => ({
  PublicSpecView: ({ markdown }: { markdown: string }) => <div data-testid="public-spec-view">{markdown}</div>,
}));

import SharePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SharePage", () => {
  it("calls notFound() when no project matches the token (never-valid or revoked)", async () => {
    getPublicProjectDataMock.mockResolvedValue(null);

    await expect(SharePage({ params: Promise.resolve({ token: "bad-token" }) })).rejects.toThrow(
      "NEXT_HTTP_ERROR_FALLBACK;404",
    );
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders the project name and diagram for a valid token", async () => {
    getPublicProjectDataMock.mockResolvedValue({
      projectName: "Project One",
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
      spec: null,
    });

    const element = await SharePage({ params: Promise.resolve({ token: "tok-1" }) });
    render(element);

    expect(screen.getByRole("heading", { name: "Project One" })).toBeInTheDocument();
    const preview = screen.getByTestId("public-canvas-preview");
    expect(preview).toHaveAttribute("data-node-count", "1");
    expect(preview).toHaveAttribute("data-edge-count", "1");
  });

  it("omits the spec section when the project has no generated spec yet", async () => {
    getPublicProjectDataMock.mockResolvedValue({
      projectName: "Project One",
      nodes: [],
      edges: [],
      spec: null,
    });

    const element = await SharePage({ params: Promise.resolve({ token: "tok-1" }) });
    render(element);

    expect(screen.queryByTestId("public-spec-view")).not.toBeInTheDocument();
  });

  it("renders the latest spec's markdown when one exists", async () => {
    getPublicProjectDataMock.mockResolvedValue({
      projectName: "Project One",
      nodes: [],
      edges: [],
      spec: { markdown: "# Spec content", createdAt: new Date("2026-08-20T00:00:00.000Z") },
    });

    const element = await SharePage({ params: Promise.resolve({ token: "tok-1" }) });
    render(element);

    expect(screen.getByTestId("public-spec-view")).toHaveTextContent("# Spec content");
  });

  it("passes the awaited token through to the data lookup", async () => {
    getPublicProjectDataMock.mockResolvedValue({
      projectName: "Project One",
      nodes: [],
      edges: [],
      spec: null,
    });

    await SharePage({ params: Promise.resolve({ token: "tok-42" }) });

    expect(getPublicProjectDataMock).toHaveBeenCalledWith("tok-42");
  });
});
