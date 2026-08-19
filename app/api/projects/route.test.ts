import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    project: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET, POST } from "./route";

function jsonRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/projects", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/projects", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(prismaMock.project.findMany).not.toHaveBeenCalled();
  });

  it("returns the authenticated user's projects", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    const projects = [{ id: "p1", ownerId: "user_1", name: "A" }];
    prismaMock.project.findMany.mockResolvedValue(projects);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ projects });
    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: "user_1" },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("POST /api/projects", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await POST(jsonRequest({ name: "Foo" }));

    expect(response.status).toBe(401);
    expect(prismaMock.project.create).not.toHaveBeenCalled();
  });

  it("creates a project owned by the authenticated user", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    const created = { id: "p1", ownerId: "user_1", name: "My Project" };
    prismaMock.project.create.mockResolvedValue(created);

    const response = await POST(jsonRequest({ name: "My Project" }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ project: created });
    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: { ownerId: "user_1", name: "My Project", description: undefined },
    });
  });

  it("defaults an empty name to Untitled Project", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.create.mockResolvedValue({ id: "p1" });

    await POST(jsonRequest({ name: "   " }));

    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: { ownerId: "user_1", name: "Untitled Project", description: undefined },
    });
  });

  it("defaults to Untitled Project when no body is sent", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.create.mockResolvedValue({ id: "p1" });

    await POST(jsonRequest());

    expect(prismaMock.project.create).toHaveBeenCalledWith({
      data: { ownerId: "user_1", name: "Untitled Project", description: undefined },
    });
  });
});
