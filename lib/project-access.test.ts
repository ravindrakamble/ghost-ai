import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, currentUserMock, prismaMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
  prismaMock: {
    project: {
      findUnique: vi.fn(),
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

import { getCallerIdentity, getProjectAccess } from "./project-access";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCallerIdentity", () => {
  it("returns null when there is no session", async () => {
    authMock.mockResolvedValue({ userId: null });

    await expect(getCallerIdentity()).resolves.toBeNull();
    expect(currentUserMock).not.toHaveBeenCalled();
  });

  it("returns the userId and primary email when signed in", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "user@example.com" },
    });

    await expect(getCallerIdentity()).resolves.toEqual({
      userId: "user_1",
      email: "user@example.com",
    });
  });

  it("returns a null email when the caller has no primary email", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    currentUserMock.mockResolvedValue({ primaryEmailAddress: null });

    await expect(getCallerIdentity()).resolves.toEqual({
      userId: "user_1",
      email: null,
    });
  });
});

describe("getProjectAccess", () => {
  it("returns unauthenticated when there is no signed-in session", async () => {
    authMock.mockResolvedValue({ userId: null });

    const result = await getProjectAccess("p1");

    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
    expect(prismaMock.project.findUnique).not.toHaveBeenCalled();
  });

  it("returns not-found when the project does not exist", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    currentUserMock.mockResolvedValue({ primaryEmailAddress: null });
    prismaMock.project.findUnique.mockResolvedValue(null);

    const result = await getProjectAccess("missing");

    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("returns forbidden when the caller is neither owner nor collaborator", async () => {
    authMock.mockResolvedValue({ userId: "user_2" });
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "other@example.com" },
    });
    prismaMock.project.findUnique.mockResolvedValue({
      id: "p1",
      name: "Project One",
      ownerId: "user_1",
      collaborators: [{ email: "someone-else@example.com" }],
    });

    const result = await getProjectAccess("p1");

    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("returns ok when the caller owns the project", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    currentUserMock.mockResolvedValue({ primaryEmailAddress: null });
    prismaMock.project.findUnique.mockResolvedValue({
      id: "p1",
      name: "Project One",
      ownerId: "user_1",
      collaborators: [],
    });

    const result = await getProjectAccess("p1");

    expect(result).toEqual({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: true,
    });
  });

  it("returns ok when the caller is a collaborator by email", async () => {
    authMock.mockResolvedValue({ userId: "user_2" });
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "collab@example.com" },
    });
    prismaMock.project.findUnique.mockResolvedValue({
      id: "p1",
      name: "Project One",
      ownerId: "user_1",
      collaborators: [{ email: "collab@example.com" }],
    });

    const result = await getProjectAccess("p1");

    expect(result).toEqual({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: false,
    });
  });

  it("returns forbidden without querying collaborators by email when the caller has no primary email", async () => {
    authMock.mockResolvedValue({ userId: "user_2" });
    currentUserMock.mockResolvedValue({ primaryEmailAddress: null });
    prismaMock.project.findUnique.mockResolvedValue({
      id: "p1",
      name: "Project One",
      ownerId: "user_1",
      collaborators: [{ email: "collab@example.com" }],
    });

    const result = await getProjectAccess("p1");

    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });
});
