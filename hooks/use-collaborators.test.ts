// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCollaborators } from "./use-collaborators";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response;
}

describe("useCollaborators", () => {
  it("does not fetch until refetch is called", () => {
    renderHook(() => useCollaborators("p1"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the collaborator list when refetch is called", async () => {
    const collaborators = [{ id: "c1", email: "a@example.com", name: null, avatarUrl: null }];
    fetchMock.mockResolvedValue(jsonResponse(true, { collaborators }));

    const { result } = renderHook(() => useCollaborators("p1"));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.collaborators).toEqual(collaborators);
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/collaborators");
  });

  it("sets an error when the list request fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { error: "Forbidden" }));

    const { result } = renderHook(() => useCollaborators("p1"));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBe("Forbidden");
    expect(result.current.collaborators).toEqual([]);
  });

  it("appends the invited collaborator on success", async () => {
    const { result } = renderHook(() => useCollaborators("p1"));

    const invited = { id: "c2", email: "new@example.com", name: null, avatarUrl: null };
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { collaborator: invited }));

    let success = false;
    await act(async () => {
      success = await result.current.invite("new@example.com");
    });

    expect(success).toBe(true);
    expect(result.current.collaborators).toEqual([invited]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/projects/p1/collaborators",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "new@example.com" }) })
    );
  });

  it("sets an error and does not modify the list when invite fails", async () => {
    const { result } = renderHook(() => useCollaborators("p1"));

    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: "Already invited" }));

    let success = true;
    await act(async () => {
      success = await result.current.invite("dup@example.com");
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Already invited");
    expect(result.current.collaborators).toEqual([]);
  });

  it("removes a collaborator from the list on success", async () => {
    const existing = { id: "c1", email: "a@example.com", name: null, avatarUrl: null };
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { collaborators: [existing] }));
    const { result } = renderHook(() => useCollaborators("p1"));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.collaborators).toEqual([existing]);

    fetchMock.mockResolvedValueOnce(jsonResponse(true, { success: true }));

    let success = false;
    await act(async () => {
      success = await result.current.remove("c1");
    });

    expect(success).toBe(true);
    expect(result.current.collaborators).toEqual([]);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/projects/p1/collaborators/c1", {
      method: "DELETE",
    });
  });

  it("sets an error and keeps the collaborator when remove fails", async () => {
    const existing = { id: "c1", email: "a@example.com", name: null, avatarUrl: null };
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { collaborators: [existing] }));
    const { result } = renderHook(() => useCollaborators("p1"));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.collaborators).toEqual([existing]);

    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: "Forbidden" }));

    let success = true;
    await act(async () => {
      success = await result.current.remove("c1");
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.collaborators).toEqual([existing]);
  });
});
