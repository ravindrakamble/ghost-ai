import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  currentUserMock,
  getProjectAccessMock,
  getLiveblocksClientMock,
  getCursorColorMock,
  getOrCreateRoomMock,
  prepareSessionMock,
  allowMock,
  authorizeMock,
} = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  getProjectAccessMock: vi.fn(),
  getLiveblocksClientMock: vi.fn(),
  getCursorColorMock: vi.fn(),
  getOrCreateRoomMock: vi.fn(),
  prepareSessionMock: vi.fn(),
  allowMock: vi.fn(),
  authorizeMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: currentUserMock,
}));

vi.mock("@/lib/project-access", () => ({
  getProjectAccess: getProjectAccessMock,
}));

vi.mock("@/lib/liveblocks", () => ({
  getLiveblocksClient: getLiveblocksClientMock,
}));

vi.mock("@/lib/liveblocks-color", () => ({
  getCursorColor: getCursorColorMock,
}));

import { POST } from "./route";

function postRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/liveblocks-auth", {
    method: "POST",
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default happy-path wiring for the Liveblocks node client mock, so each
  // test only needs to override what it cares about.
  prepareSessionMock.mockReturnValue({ allow: allowMock, authorize: authorizeMock });
  getOrCreateRoomMock.mockResolvedValue({ id: "p1" });
  authorizeMock.mockResolvedValue({ status: 200, body: '{"token":"fake-token"}' });
  getLiveblocksClientMock.mockReturnValue({
    getOrCreateRoom: getOrCreateRoomMock,
    prepareSession: prepareSessionMock,
  });
  getCursorColorMock.mockReturnValue("#00C8D4");
});

describe("POST /api/liveblocks-auth", () => {
  it("returns 400 for an invalid JSON body", async () => {
    const response = await POST(postRequest());
    expect(response.status).toBe(400);
    expect(getProjectAccessMock).not.toHaveBeenCalled();
  });

  it("returns 400 when `room` is missing", async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(400);
    expect(getProjectAccessMock).not.toHaveBeenCalled();
  });

  it("returns 400 when `room` is not a string", async () => {
    const response = await POST(postRequest({ room: 123 }));
    expect(response.status).toBe(400);
    expect(getProjectAccessMock).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no signed-in session", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "unauthenticated" });

    const response = await POST(postRequest({ room: "p1" }));

    expect(response.status).toBe(401);
    expect(getLiveblocksClientMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the project does not exist", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "not-found" });

    const response = await POST(postRequest({ room: "missing" }));

    expect(response.status).toBe(404);
  });

  it("returns 403 when the caller is neither owner nor collaborator", async () => {
    getProjectAccessMock.mockResolvedValue({ ok: false, reason: "forbidden" });

    const response = await POST(postRequest({ room: "p1" }));

    expect(response.status).toBe(403);
    expect(getLiveblocksClientMock).not.toHaveBeenCalled();
  });

  it("returns 401 if the caller's Clerk session can't be resolved after access is granted", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: true,
    });
    currentUserMock.mockResolvedValue(null);

    const response = await POST(postRequest({ room: "p1" }));

    expect(response.status).toBe(401);
    expect(getLiveblocksClientMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the Liveblocks client is not configured (no secret key)", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: true,
    });
    currentUserMock.mockResolvedValue({
      id: "user_1",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      imageUrl: "https://example.com/ada.png",
    });
    getLiveblocksClientMock.mockImplementation(() => {
      throw new Error("LIVEBLOCKS_SECRET_KEY is not set.");
    });

    const response = await POST(postRequest({ room: "p1" }));

    expect(response.status).toBe(500);
  });

  it("returns 502 when the Liveblocks room/session request fails upstream", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: true,
    });
    currentUserMock.mockResolvedValue({
      id: "user_1",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      imageUrl: "https://example.com/ada.png",
    });
    getOrCreateRoomMock.mockRejectedValue(new Error("upstream unavailable"));

    const response = await POST(postRequest({ room: "p1" }));

    expect(response.status).toBe(502);
  });

  it("creates the room if needed and returns a session token on success", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: false,
    });
    currentUserMock.mockResolvedValue({
      id: "user_1",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      imageUrl: "https://example.com/ada.png",
    });
    getCursorColorMock.mockReturnValue("#6457F9");
    authorizeMock.mockResolvedValue({ status: 200, body: '{"token":"real-token"}' });

    const response = await POST(postRequest({ room: "p1" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ token: "real-token" });

    expect(getOrCreateRoomMock).toHaveBeenCalledWith("p1", { defaultAccesses: [] });
    expect(getCursorColorMock).toHaveBeenCalledWith("user_1");
    expect(prepareSessionMock).toHaveBeenCalledWith("user_1", {
      userInfo: {
        name: "Ada Lovelace",
        avatar: "https://example.com/ada.png",
        color: "#6457F9",
      },
    });
    expect(allowMock).toHaveBeenCalledWith("p1", ["room:write"]);
  });

  it("does not attempt to recreate an already-existing room (idempotent)", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: true,
    });
    currentUserMock.mockResolvedValue({
      id: "user_1",
      firstName: "Ada",
      lastName: null,
      username: "ada",
      imageUrl: "",
    });

    await POST(postRequest({ room: "p1" }));

    // `getOrCreateRoom` is the Liveblocks API's own idempotent primitive —
    // the route calls it exactly once and lets Liveblocks decide whether a
    // create is actually needed, rather than doing its own existence probe.
    expect(getOrCreateRoomMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the caller's username when no first/last name is set", async () => {
    getProjectAccessMock.mockResolvedValue({
      ok: true,
      project: { id: "p1", name: "Project One" },
      isOwner: true,
    });
    currentUserMock.mockResolvedValue({
      id: "user_2",
      firstName: null,
      lastName: null,
      username: "no-name-user",
      imageUrl: "",
    });

    await POST(postRequest({ room: "p1" }));

    expect(prepareSessionMock).toHaveBeenCalledWith(
      "user_2",
      expect.objectContaining({ userInfo: expect.objectContaining({ name: "no-name-user" }) }),
    );
  });
});
