import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  currentUserMock,
  getProjectAccessMock,
  getAuthenticatedUserIdMock,
  getOwnedProjectOrErrorMock,
  listCollaboratorsMock,
  inviteCollaboratorMock,
} = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  getProjectAccessMock: vi.fn(),
  getAuthenticatedUserIdMock: vi.fn(),
  getOwnedProjectOrErrorMock: vi.fn(),
  listCollaboratorsMock: vi.fn(),
  inviteCollaboratorMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: currentUserMock,
}));

vi.mock("@/lib/project-access", () => ({
  getProjectAccess: getProjectAccessMock,
}));

vi.mock("@/lib/projects", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  getOwnedProjectOrError: getOwnedProjectOrErrorMock,
}));

vi.mock("@/lib/collaborators", () => ({
  listCollaborators: listCollaboratorsMock,
  inviteCollaborator: inviteCollaboratorMock,
  isValidEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
}));

import { GET, POST } from "./route";

function ctx(projectId = "p1") {
  return { params: Promise.resolve({ projectId }) };
}

function postRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/projects/p1/collaborators", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/projects/[projectId]/collaborators", () => {
  it("returns 401 when unauthenticated", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "unauthenticated" });

    const response = await GET(new NextRequest("http://localhost/x"), ctx());

    expect(response.status).toBe(401);
    expect(listCollaboratorsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "not-found" });

    const response = await GET(new NextRequest("http://localhost/x"), ctx());

    expect(response.status).toBe(404);
  });

  it("returns 403 when the caller is neither owner nor collaborator", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "forbidden" });

    const response = await GET(new NextRequest("http://localhost/x"), ctx());

    expect(response.status).toBe(403);
  });

  it("returns the collaborator list for an owner or collaborator caller", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: false,
    });
    const collaborators = [{ id: "c1", email: "a@example.com", name: null, avatarUrl: null }];
    listCollaboratorsMock.mockResolvedValue(collaborators);

    const response = await GET(new NextRequest("http://localhost/x"), ctx());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ collaborators });
    expect(listCollaboratorsMock).toHaveBeenCalledWith("p1");
  });
});

describe("POST /api/projects/[projectId]/collaborators", () => {
  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue(null);

    const response = await POST(postRequest({ email: "a@example.com" }), ctx());

    expect(response.status).toBe(401);
    expect(getOwnedProjectOrErrorMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_1");

    const response = await POST(postRequest(), ctx());

    expect(response.status).toBe(400);
  });

  it("returns 400 for a malformed email", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_1");

    const response = await POST(postRequest({ email: "not-an-email" }), ctx());

    expect(response.status).toBe(400);
    expect(getOwnedProjectOrErrorMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_1");
    getOwnedProjectOrErrorMock.mockResolvedValue({ ok: false, status: 404 });

    const response = await POST(postRequest({ email: "teammate@example.com" }), ctx());

    expect(response.status).toBe(404);
  });

  it("returns 403 when the caller is not the owner", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_2");
    getOwnedProjectOrErrorMock.mockResolvedValue({ ok: false, status: 403 });

    const response = await POST(postRequest({ email: "teammate@example.com" }), ctx());

    expect(response.status).toBe(403);
    expect(inviteCollaboratorMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the owner invites their own email", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_1");
    getOwnedProjectOrErrorMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", ownerId: "user_1" },
    });
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "owner@example.com" },
    });

    const response = await POST(postRequest({ email: "owner@example.com" }), ctx());

    expect(response.status).toBe(400);
    expect(inviteCollaboratorMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the email is already a collaborator", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_1");
    getOwnedProjectOrErrorMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", ownerId: "user_1" },
    });
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "owner@example.com" },
    });
    inviteCollaboratorMock.mockResolvedValue({
      ok: false,
      status: 409,
      message: "This email is already a collaborator on this project.",
    });

    const response = await POST(postRequest({ email: "teammate@example.com" }), ctx());

    expect(response.status).toBe(409);
  });

  it("invites the collaborator when the caller is the owner", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_1");
    getOwnedProjectOrErrorMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", ownerId: "user_1" },
    });
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "owner@example.com" },
    });
    const collaborator = {
      id: "c1",
      email: "teammate@example.com",
      name: null,
      avatarUrl: null,
    };
    inviteCollaboratorMock.mockResolvedValue({ ok: true, collaborator });

    const response = await POST(postRequest({ email: "teammate@example.com" }), ctx());

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ collaborator });
    expect(inviteCollaboratorMock).toHaveBeenCalledWith("p1", "teammate@example.com");
  });
});
