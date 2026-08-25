// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useProjectSpecs } from "./use-project-specs";

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

describe("useProjectSpecs", () => {
  it("fetches the spec list on mount", async () => {
    const specs = [{ id: "s1", filename: "spec-s1.md", createdAt: "2026-01-01T00:00:00.000Z", hasIac: true }];
    fetchMock.mockResolvedValue(jsonResponse(true, { specs }));

    const { result } = renderHook(() => useProjectSpecs("p1"));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.specs).toEqual(specs);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/specs");
  });

  it("sets an error and an empty list when the request fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { error: "Forbidden" }));

    const { result } = renderHook(() => useProjectSpecs("p1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.specs).toEqual([]);
  });

  it("sets a generic error on a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useProjectSpecs("p1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toMatch(/failed to load specs/i);
    expect(result.current.specs).toEqual([]);
  });

  it("re-fetches when refetch is called", async () => {
    const firstSpecs = [{ id: "s1", filename: "spec-s1.md", createdAt: "2026-01-01T00:00:00.000Z", hasIac: false }];
    const secondSpecs = [
      ...firstSpecs,
      { id: "s2", filename: "spec-s2.md", createdAt: "2026-01-02T00:00:00.000Z", hasIac: true },
    ];
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { specs: firstSpecs }))
      .mockResolvedValueOnce(jsonResponse(true, { specs: secondSpecs }));

    const { result } = renderHook(() => useProjectSpecs("p1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.specs).toEqual(firstSpecs);

    act(() => {
      result.current.refetch();
    });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.specs).toEqual(secondSpecs);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when projectId changes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(true, { specs: [] }));

    const { rerender } = renderHook(({ projectId }) => useProjectSpecs(projectId), {
      initialProps: { projectId: "p1" },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/specs"));

    rerender({ projectId: "p2" });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/projects/p2/specs"));
  });
});
