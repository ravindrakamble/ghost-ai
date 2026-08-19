import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getAuthenticatedUserIdMock, getOwnedProjectOrErrorMock, removeCollaboratorMock } =
  vi.hoisted(() => ({
    getAuthenticatedUserIdMock: vi.fn(),
    getOwnedProjectOrErrorMock: vi.fn(),
    removeCollaboratorMock: vi.fn(),
  }));

vi.mock("@/lib/projects", () => ({
  getAuthenticatedUserId: getAuthenticatedUserIdMock,
  getOwnedProjectOrError: getOwnedProjectOrErrorMock,
}));

vi.mock("@/lib/collaborators", () => ({
  removeCollaborator: removeCollaboratorMock,
}));

import { DELETE } from "./route";

function ctx(projectId = "p1", collaboratorId = "c1") {
  return { params: Promise.resolve({ projectId, collaboratorId }) };
}

function deleteRequest() {
  return new NextRequest("http://localhost/api/projects/p1/collaborators/c1", {
    method: "DELETE",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/projects/[projectId]/collaborators/[collaboratorId]", () => {
  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(401);
    expect(getOwnedProjectOrErrorMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_1");
    getOwnedProjectOrErrorMock.mockResolvedValue({ ok: false, status: 404 });

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(404);
    expect(removeCollaboratorMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not the owner", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_2");
    getOwnedProjectOrErrorMock.mockResolvedValue({ ok: false, status: 403 });

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(403);
    expect(removeCollaboratorMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the collaborator does not belong to the project", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_1");
    getOwnedProjectOrErrorMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", ownerId: "user_1" },
    });
    removeCollaboratorMock.mockResolvedValue({ ok: false, status: 404 });

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(404);
  });

  it("removes the collaborator when the caller is the owner", async () => {
    getAuthenticatedUserIdMock.mockResolvedValue("user_1");
    getOwnedProjectOrErrorMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", ownerId: "user_1" },
    });
    removeCollaboratorMock.mockResolvedValue({ ok: true });

    const response = await DELETE(deleteRequest(), ctx());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true });
    expect(removeCollaboratorMock).toHaveBeenCalledWith("p1", "c1");
  });
});
