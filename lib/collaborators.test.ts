import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserListMock, prismaMock, FakePrismaClientKnownRequestError } = vi.hoisted(() => {
  class FakePrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    getUserListMock: vi.fn(),
    prismaMock: {
      projectCollaborator: {
        findMany: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
    FakePrismaClientKnownRequestError,
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: { getUserList: getUserListMock },
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: FakePrismaClientKnownRequestError },
}));

import {
  inviteCollaborator,
  isValidEmail,
  listCollaborators,
  removeCollaborator,
} from "./collaborators";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isValidEmail", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmail("teammate@example.com")).toBe(true);
  });

  it.each(["not-an-email", "missing-domain@", "@missing-local.com", ""])(
    "rejects %s",
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    }
  );
});

describe("listCollaborators", () => {
  it("returns an empty list without calling Clerk when there are no rows", async () => {
    prismaMock.projectCollaborator.findMany.mockResolvedValue([]);

    const result = await listCollaborators("p1");

    expect(result).toEqual([]);
    expect(getUserListMock).not.toHaveBeenCalled();
  });

  it("enriches rows with a matching Clerk user's name and avatar", async () => {
    prismaMock.projectCollaborator.findMany.mockResolvedValue([
      { id: "c1", email: "teammate@example.com" },
    ]);
    getUserListMock.mockResolvedValue({
      data: [
        {
          firstName: "Ada",
          lastName: "Lovelace",
          imageUrl: "https://img.clerk/ada.png",
          emailAddresses: [{ emailAddress: "teammate@example.com" }],
        },
      ],
    });

    const result = await listCollaborators("p1");

    expect(result).toEqual([
      {
        id: "c1",
        email: "teammate@example.com",
        name: "Ada Lovelace",
        avatarUrl: "https://img.clerk/ada.png",
      },
    ]);
  });

  it("falls back to email-only when no Clerk user matches", async () => {
    prismaMock.projectCollaborator.findMany.mockResolvedValue([
      { id: "c1", email: "nomatch@example.com" },
    ]);
    getUserListMock.mockResolvedValue({ data: [] });

    const result = await listCollaborators("p1");

    expect(result).toEqual([
      { id: "c1", email: "nomatch@example.com", name: null, avatarUrl: null },
    ]);
  });

  it("falls back to email-only for every row when the Clerk API call itself fails", async () => {
    prismaMock.projectCollaborator.findMany.mockResolvedValue([
      { id: "c1", email: "teammate@example.com" },
    ]);
    getUserListMock.mockRejectedValue(new Error("Clerk is down"));

    const result = await listCollaborators("p1");

    expect(result).toEqual([
      { id: "c1", email: "teammate@example.com", name: null, avatarUrl: null },
    ]);
  });
});

describe("inviteCollaborator", () => {
  it("creates the row and returns it Clerk-enriched", async () => {
    prismaMock.projectCollaborator.create.mockResolvedValue({
      id: "c1",
      email: "teammate@example.com",
    });
    getUserListMock.mockResolvedValue({
      data: [
        {
          firstName: "Ada",
          lastName: null,
          imageUrl: "",
          emailAddresses: [{ emailAddress: "teammate@example.com" }],
        },
      ],
    });

    const result = await inviteCollaborator("p1", "teammate@example.com");

    expect(result).toEqual({
      ok: true,
      collaborator: {
        id: "c1",
        email: "teammate@example.com",
        name: "Ada",
        avatarUrl: null,
      },
    });
    expect(prismaMock.projectCollaborator.create).toHaveBeenCalledWith({
      data: { projectId: "p1", email: "teammate@example.com" },
      select: { id: true, email: true },
    });
  });

  it("maps a unique constraint violation (P2002) to a 409", async () => {
    prismaMock.projectCollaborator.create.mockRejectedValue(
      new FakePrismaClientKnownRequestError("Unique constraint failed", "P2002")
    );

    const result = await inviteCollaborator("p1", "teammate@example.com");

    expect(result).toEqual({
      ok: false,
      status: 409,
      message: "This email is already a collaborator on this project.",
    });
  });

  it("rethrows unrelated errors", async () => {
    prismaMock.projectCollaborator.create.mockRejectedValue(new Error("boom"));

    await expect(inviteCollaborator("p1", "teammate@example.com")).rejects.toThrow("boom");
  });
});

describe("removeCollaborator", () => {
  it("returns ok when a row was deleted", async () => {
    prismaMock.projectCollaborator.deleteMany.mockResolvedValue({ count: 1 });

    const result = await removeCollaborator("p1", "c1");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.projectCollaborator.deleteMany).toHaveBeenCalledWith({
      where: { id: "c1", projectId: "p1" },
    });
  });

  it("returns 404 when no matching row exists for that project", async () => {
    prismaMock.projectCollaborator.deleteMany.mockResolvedValue({ count: 0 });

    const result = await removeCollaborator("p1", "missing");

    expect(result).toEqual({ ok: false, status: 404 });
  });
});
