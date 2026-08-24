import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, fetchCanvasSnapshotMock, fetchSpecMarkdownMock } = vi.hoisted(() => ({
  prismaMock: {
    project: {
      findUnique: vi.fn(),
    },
  },
  fetchCanvasSnapshotMock: vi.fn(),
  fetchSpecMarkdownMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/canvas-blob", () => ({
  fetchCanvasSnapshot: fetchCanvasSnapshotMock,
}));

vi.mock("@/lib/spec-blob", () => ({
  fetchSpecMarkdown: fetchSpecMarkdownMock,
}));

import { getPublicProjectData } from "./public-project";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicProjectData", () => {
  it("returns null when no project matches the token", async () => {
    prismaMock.project.findUnique.mockResolvedValue(null);

    const result = await getPublicProjectData("bad-token");

    expect(result).toBeNull();
    expect(fetchCanvasSnapshotMock).not.toHaveBeenCalled();
  });

  it("looks the project up by publicShareToken", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: null,
      specs: [],
    });

    await getPublicProjectData("tok-1");

    expect(prismaMock.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicShareToken: "tok-1" } }),
    );
  });

  it("returns empty nodes/edges (not an error) when no canvas has ever been saved", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: null,
      specs: [],
    });

    const result = await getPublicProjectData("tok-1");

    expect(result).toEqual({ projectName: "Project One", nodes: [], edges: [], spec: null });
    expect(fetchCanvasSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns empty nodes/edges when the referenced canvas blob is missing/corrupt", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: "https://blob/canvas/p1.json",
      specs: [],
    });
    fetchCanvasSnapshotMock.mockResolvedValue(null);

    const result = await getPublicProjectData("tok-1");

    expect(result?.nodes).toEqual([]);
    expect(result?.edges).toEqual([]);
  });

  it("returns the saved canvas snapshot's nodes/edges", async () => {
    const nodes = [{ id: "n1" }];
    const edges = [{ id: "e1" }];
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: "https://blob/canvas/p1.json",
      specs: [],
    });
    fetchCanvasSnapshotMock.mockResolvedValue({ nodes, edges });

    const result = await getPublicProjectData("tok-1");

    expect(result?.nodes).toEqual(nodes);
    expect(result?.edges).toEqual(edges);
    expect(fetchCanvasSnapshotMock).toHaveBeenCalledWith("https://blob/canvas/p1.json");
  });

  it("propagates a genuine upstream canvas blob failure rather than swallowing it", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: "https://blob/canvas/p1.json",
      specs: [],
    });
    fetchCanvasSnapshotMock.mockRejectedValue(new Error("network error"));

    await expect(getPublicProjectData("tok-1")).rejects.toThrow("network error");
  });

  it("omits the spec section (not an error) when no spec has been generated yet", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: null,
      specs: [],
    });

    const result = await getPublicProjectData("tok-1");

    expect(result?.spec).toBeNull();
    expect(fetchSpecMarkdownMock).not.toHaveBeenCalled();
  });

  it("fetches and returns the most recently created spec's Markdown", async () => {
    const createdAt = new Date("2026-08-20T00:00:00.000Z");
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: null,
      specs: [{ filePath: "https://blob/specs/p1/s1.md", createdAt }],
    });
    fetchSpecMarkdownMock.mockResolvedValue("# Spec content");

    const result = await getPublicProjectData("tok-1");

    expect(result?.spec).toEqual({ markdown: "# Spec content", createdAt });
    expect(fetchSpecMarkdownMock).toHaveBeenCalledWith("https://blob/specs/p1/s1.md");
  });

  it("orders specs by most-recently-created via the Prisma query itself", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: null,
      specs: [],
    });

    await getPublicProjectData("tok-1");

    const call = prismaMock.project.findUnique.mock.calls[0][0];
    expect(call.select.specs).toMatchObject({
      orderBy: { createdAt: "desc" },
      take: 1,
    });
  });

  it("returns spec: null when the referenced spec blob is missing/corrupt", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: null,
      specs: [{ filePath: "https://blob/specs/p1/s1.md", createdAt: new Date() }],
    });
    fetchSpecMarkdownMock.mockResolvedValue(null);

    const result = await getPublicProjectData("tok-1");

    expect(result?.spec).toBeNull();
  });

  it("never includes ownerId, collaborators, or publicShareToken in the returned shape", async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      name: "Project One",
      canvasJsonPath: null,
      specs: [],
    });

    const result = await getPublicProjectData("tok-1");

    expect(result).toEqual({ projectName: "Project One", nodes: [], edges: [], spec: null });
    expect(result).not.toHaveProperty("ownerId");
    expect(result).not.toHaveProperty("publicShareToken");
  });
});
