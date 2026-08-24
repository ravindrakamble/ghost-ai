import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { authMock, prismaMock, randomUUIDMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  randomUUIDMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("node:crypto", () => ({
  randomUUID: randomUUIDMock,
}));

import { GET, POST, DELETE } from "./route";

function request(method: string) {
  return new NextRequest("http://localhost/api/projects/p1/public-link", { method });
}

function ctx(projectId = "p1") {
  return { params: Promise.resolve({ projectId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/projects/[projectId]/public-link", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await GET(request("GET"), ctx());

    expect(response.status).toBe(401);
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent project", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue(null);

    const response = await GET(request("GET"), ctx());

    expect(response.status).toBe(404);
  });

  it("returns 403 when the caller is not the owner (a collaborator, not the owner)", async () => {
    authMock.mockResolvedValue({ userId: "user_2" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1", publicShareToken: null });

    const response = await GET(request("GET"), ctx());

    expect(response.status).toBe(403);
  });

  it("returns the existing token for the owner", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue({
      id: "p1",
      ownerId: "user_1",
      publicShareToken: "existing-token",
    });

    const response = await GET(request("GET"), ctx());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "existing-token" });
  });

  it("returns null when no link has been generated yet", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1", publicShareToken: null });

    const response = await GET(request("GET"), ctx());

    expect(await response.json()).toEqual({ token: null });
  });
});

describe("POST /api/projects/[projectId]/public-link", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await POST(request("POST"), ctx());

    expect(response.status).toBe(401);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent project", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue(null);

    const response = await POST(request("POST"), ctx());

    expect(response.status).toBe(404);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the owner", async () => {
    authMock.mockResolvedValue({ userId: "user_2" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1", publicShareToken: null });

    const response = await POST(request("POST"), ctx());

    expect(response.status).toBe(403);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("generates a new token and persists it for the owner", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1", publicShareToken: null });
    randomUUIDMock.mockReturnValue("new-token-123");
    prismaMock.project.update.mockResolvedValue({ id: "p1", publicShareToken: "new-token-123" });

    const response = await POST(request("POST"), ctx());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: "new-token-123" });
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { publicShareToken: "new-token-123" },
    });
  });

  it("overwrites an existing token when called again (regenerate)", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue({
      id: "p1",
      ownerId: "user_1",
      publicShareToken: "old-token",
    });
    randomUUIDMock.mockReturnValue("fresh-token");
    prismaMock.project.update.mockResolvedValue({ id: "p1", publicShareToken: "fresh-token" });

    const response = await POST(request("POST"), ctx());

    expect(await response.json()).toEqual({ token: "fresh-token" });
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { publicShareToken: "fresh-token" },
    });
  });
});

describe("DELETE /api/projects/[projectId]/public-link", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await DELETE(request("DELETE"), ctx());

    expect(response.status).toBe(401);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent project", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue(null);

    const response = await DELETE(request("DELETE"), ctx());

    expect(response.status).toBe(404);
  });

  it("returns 403 when the caller is not the owner", async () => {
    authMock.mockResolvedValue({ userId: "user_2" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1", publicShareToken: "t" });

    const response = await DELETE(request("DELETE"), ctx());

    expect(response.status).toBe(403);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("clears the token for the owner", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1", publicShareToken: "t" });
    prismaMock.project.update.mockResolvedValue({ id: "p1", publicShareToken: null });

    const response = await DELETE(request("DELETE"), ctx());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { publicShareToken: null },
    });
  });
});
