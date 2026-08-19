import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { PATCH, DELETE } from "./route";

function patchRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/projects/p1", {
    method: "PATCH",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

function deleteRequest() {
  return new NextRequest("http://localhost/api/projects/p1", { method: "DELETE" });
}

function ctx(projectId = "p1") {
  return { params: Promise.resolve({ projectId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/projects/[projectId]", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await PATCH(patchRequest({ name: "New" }), ctx());

    expect(response.status).toBe(401);
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
  });

  it("returns 400 when name is missing", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });

    const response = await PATCH(patchRequest({ name: "" }), ctx());

    expect(response.status).toBe(400);
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent project", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ name: "New" }), ctx());

    expect(response.status).toBe(404);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the owner", async () => {
    authMock.mockResolvedValue({ userId: "user_2" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1" });

    const response = await PATCH(patchRequest({ name: "New" }), ctx());

    expect(response.status).toBe(403);
    expect(prismaMock.project.update).not.toHaveBeenCalled();
  });

  it("renames the project when the caller is the owner", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1" });
    const updated = { id: "p1", ownerId: "user_1", name: "New" };
    prismaMock.project.update.mockResolvedValue(updated);

    const response = await PATCH(patchRequest({ name: "New" }), ctx());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ project: updated });
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { name: "New" },
    });
  });
});

describe("DELETE /api/projects/[projectId]", () => {
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(401);
    expect(prismaMock.project.delete).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-existent project", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(404);
    expect(prismaMock.project.delete).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the owner", async () => {
    authMock.mockResolvedValue({ userId: "user_2" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1" });

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(403);
    expect(prismaMock.project.delete).not.toHaveBeenCalled();
  });

  it("deletes the project when the caller is the owner", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1" });
    prismaMock.project.delete.mockResolvedValue({ id: "p1" });

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
    expect(prismaMock.project.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});
