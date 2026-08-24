// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePublicLink } from "./use-public-link";

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

describe("usePublicLink", () => {
  it("does not fetch until refetch is called", () => {
    renderHook(() => usePublicLink("p1"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the current token when refetch is called", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { token: "existing-token" }));

    const { result } = renderHook(() => usePublicLink("p1"));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.token).toBe("existing-token");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/public-link");
  });

  it("resolves a null token to no-link-yet state", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { token: null }));

    const { result } = renderHook(() => usePublicLink("p1"));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets an error when the list request fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { error: "Forbidden" }));

    const { result } = renderHook(() => usePublicLink("p1"));
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBe("Forbidden");
  });

  it("generates a new token via POST and stores it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { token: "new-token" }));

    const { result } = renderHook(() => usePublicLink("p1"));

    let success = false;
    await act(async () => {
      success = await result.current.generate();
    });

    expect(success).toBe(true);
    expect(result.current.token).toBe("new-token");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/public-link", { method: "POST" });
  });

  it("sets an error and does not change the token when generate fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: "Forbidden" }));

    const { result } = renderHook(() => usePublicLink("p1"));

    let success = true;
    await act(async () => {
      success = await result.current.generate();
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.token).toBeNull();
  });

  it("revokes the token via DELETE and clears it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { token: "existing-token" }));
    const { result } = renderHook(() => usePublicLink("p1"));
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.token).toBe("existing-token");

    fetchMock.mockResolvedValueOnce(jsonResponse(true, { success: true }));

    let success = false;
    await act(async () => {
      success = await result.current.revoke();
    });

    expect(success).toBe(true);
    expect(result.current.token).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/projects/p1/public-link", { method: "DELETE" });
  });

  it("sets an error and keeps the token when revoke fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { token: "existing-token" }));
    const { result } = renderHook(() => usePublicLink("p1"));
    await act(async () => {
      await result.current.refetch();
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: "Forbidden" }));

    let success = true;
    await act(async () => {
      success = await result.current.revoke();
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.token).toBe("existing-token");
  });
});
