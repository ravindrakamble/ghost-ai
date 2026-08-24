import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getPublicProjectDataMock } = vi.hoisted(() => ({
  getPublicProjectDataMock: vi.fn(),
}));

vi.mock("@/lib/public-project", () => ({
  getPublicProjectData: getPublicProjectDataMock,
}));

import { GET } from "./route";

function request() {
  return new NextRequest("http://localhost/api/public/tok-1", { method: "GET" });
}

function ctx(token = "tok-1") {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/public/[token]", () => {
  it("returns 404 for a token with no matching project", async () => {
    getPublicProjectDataMock.mockResolvedValue(null);

    const response = await GET(request(), ctx());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("returns the same 404 shape for a never-valid token as a revoked one (no distinguishing signal)", async () => {
    getPublicProjectDataMock.mockResolvedValueOnce(null);
    const neverValid = await GET(request(), ctx("never-existed"));

    getPublicProjectDataMock.mockResolvedValueOnce(null);
    const revoked = await GET(request(), ctx("was-revoked"));

    expect(neverValid.status).toBe(revoked.status);
    expect(await neverValid.json()).toEqual(await revoked.json());
  });

  it("requires no authentication — no Clerk import/call anywhere in this route", async () => {
    getPublicProjectDataMock.mockResolvedValue({
      projectName: "Project One",
      nodes: [],
      edges: [],
      spec: null,
    });

    const response = await GET(request(), ctx());

    expect(response.status).toBe(200);
  });

  it("returns the project name, nodes, edges, and spec for a valid token", async () => {
    getPublicProjectDataMock.mockResolvedValue({
      projectName: "Project One",
      nodes: [{ id: "n1" }],
      edges: [{ id: "e1" }],
      spec: { markdown: "# Spec", createdAt: new Date("2026-08-20T00:00:00.000Z") },
    });

    const response = await GET(request(), ctx());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projectName).toBe("Project One");
    expect(body.nodes).toEqual([{ id: "n1" }]);
    expect(body.edges).toEqual([{ id: "e1" }]);
    expect(body.spec.markdown).toBe("# Spec");
  });

  it("never returns ownerId or publicShareToken (the underlying lookup already excludes them)", async () => {
    getPublicProjectDataMock.mockResolvedValue({
      projectName: "Project One",
      nodes: [],
      edges: [],
      spec: null,
    });

    const response = await GET(request(), ctx());
    const body = await response.json();

    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("publicShareToken");
  });

  it("returns 500 on a genuine upstream failure rather than a 404", async () => {
    getPublicProjectDataMock.mockRejectedValue(new Error("blob outage"));

    const response = await GET(request(), ctx());

    expect(response.status).toBe(500);
  });
});
