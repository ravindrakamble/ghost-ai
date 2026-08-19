import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, currentUserMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
  prismaMock: {
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { getAuthenticatedUserId, getOwnedProjectOrError, getProjectsForUser } from "./projects";

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

describe("getProjectsForUser", () => {
  it("returns empty lists when there is no signed-in user", async () => {
    currentUserMock.mockResolvedValue(null);

    const result = await getProjectsForUser();

    expect(result).toEqual({ owned: [], shared: [] });
    expect(prismaMock.project.findMany).not.toHaveBeenCalled();
  });

  it("queries owned projects by user id and shared projects by primary email", async () => {
    currentUserMock.mockResolvedValue({
      id: "user_1",
      primaryEmailAddress: { emailAddress: "user@example.com" },
    });
    const owned = [{ id: "p1", name: "Owned" }];
    const shared = [{ id: "p2", name: "Shared" }];
    prismaMock.project.findMany
      .mockResolvedValueOnce(owned)
      .mockResolvedValueOnce(shared);

    const result = await getProjectsForUser();

    expect(result).toEqual({ owned, shared });
    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: { ownerId: "user_1" },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    });
    expect(prismaMock.project.findMany).toHaveBeenCalledWith({
      where: { collaborators: { some: { email: "user@example.com" } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    });
  });

  it("returns an empty shared list without querying when there is no primary email", async () => {
    currentUserMock.mockResolvedValue({ id: "user_1", primaryEmailAddress: null });
    const owned = [{ id: "p1", name: "Owned" }];
    prismaMock.project.findMany.mockResolvedValue(owned);

    const result = await getProjectsForUser();

    expect(result).toEqual({ owned, shared: [] });
    expect(prismaMock.project.findMany).toHaveBeenCalledTimes(1);
  });
});
