import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  prismaMock: {
    project: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { getAuthenticatedUserId, getOwnedProjectOrError } from "./projects";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAuthenticatedUserId", () => {
  it("returns the userId from Clerk's auth()", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    await expect(getAuthenticatedUserId()).resolves.toBe("user_1");
  });

  it("returns null when there is no session", async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(getAuthenticatedUserId()).resolves.toBeNull();
  });
});

describe("getOwnedProjectOrError", () => {
  it("returns status 404 when the project does not exist", async () => {
    prismaMock.project.findUnique.mockResolvedValue(null);

    const result = await getOwnedProjectOrError("missing", "user_1");

    expect(result).toEqual({ ok: false, status: 404 });
  });

  it("returns status 403 when the caller does not own the project", async () => {
    prismaMock.project.findUnique.mockResolvedValue({ id: "p1", ownerId: "user_1" });

    const result = await getOwnedProjectOrError("p1", "user_2");

    expect(result).toEqual({ ok: false, status: 403 });
  });

  it("returns the project when the caller is the owner", async () => {
    const project = { id: "p1", ownerId: "user_1" };
    prismaMock.project.findUnique.mockResolvedValue(project);

    const result = await getOwnedProjectOrError("p1", "user_1");

    expect(result).toEqual({ ok: true, project });
  });
});
