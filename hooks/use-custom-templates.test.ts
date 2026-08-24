// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useCustomTemplates } from "./use-custom-templates"

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(ok: boolean, body: unknown) {
  return { ok, json: async () => body } as Response
}

describe("useCustomTemplates", () => {
  it("fetches the saved-template list on mount", async () => {
    const templates = [
      { id: "t1", name: "Microservices baseline", description: null, createdAt: "2026-01-01T00:00:00.000Z" },
    ]
    fetchMock.mockResolvedValue(jsonResponse(true, { templates }))

    const { result } = renderHook(() => useCustomTemplates())

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.templates).toEqual(templates)
    expect(result.current.error).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith("/api/templates")
  })

  it("sets an error and an empty list when the list request fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse(false, { error: "Unauthorized" }))

    const { result } = renderHook(() => useCustomTemplates())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe("Unauthorized")
    expect(result.current.templates).toEqual([])
  })

  it("sets a generic error on a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"))

    const { result } = renderHook(() => useCustomTemplates())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toMatch(/failed to load your saved templates/i)
    expect(result.current.templates).toEqual([])
  })

  it("re-fetches when refetch is called", async () => {
    const first = [{ id: "t1", name: "One", description: null, createdAt: "2026-01-01T00:00:00.000Z" }]
    const second = [
      ...first,
      { id: "t2", name: "Two", description: "desc", createdAt: "2026-01-02T00:00:00.000Z" },
    ]
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { templates: first }))
      .mockResolvedValueOnce(jsonResponse(true, { templates: second }))

    const { result } = renderHook(() => useCustomTemplates())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.templates).toEqual(first)

    act(() => {
      result.current.refetch()
    })

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.templates).toEqual(second)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("removes a template from the list on successful delete", async () => {
    const existing = { id: "t1", name: "One", description: null, createdAt: "2026-01-01T00:00:00.000Z" }
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { templates: [existing] }))
    const { result } = renderHook(() => useCustomTemplates())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.templates).toEqual([existing])

    fetchMock.mockResolvedValueOnce(jsonResponse(true, { success: true }))

    let success = false
    await act(async () => {
      success = await result.current.remove("t1")
    })

    expect(success).toBe(true)
    expect(result.current.templates).toEqual([])
    expect(fetchMock).toHaveBeenLastCalledWith("/api/templates/t1", { method: "DELETE" })
  })

  it("sets an error and keeps the template when delete fails", async () => {
    const existing = { id: "t1", name: "One", description: null, createdAt: "2026-01-01T00:00:00.000Z" }
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { templates: [existing] }))
    const { result } = renderHook(() => useCustomTemplates())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    fetchMock.mockResolvedValueOnce(jsonResponse(false, { error: "Forbidden" }))

    let success = true
    await act(async () => {
      success = await result.current.remove("t1")
    })

    expect(success).toBe(false)
    expect(result.current.error).toBe("Forbidden")
    expect(result.current.templates).toEqual([existing])
  })

  it("tracks removingId while a delete is in flight", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, { templates: [] }))
    const { result } = renderHook(() => useCustomTemplates())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let resolveDelete: (value: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveDelete = resolve
      }),
    )

    let removePromise!: Promise<boolean>
    act(() => {
      removePromise = result.current.remove("t1")
    })

    await waitFor(() => expect(result.current.removingId).toBe("t1"))

    await act(async () => {
      resolveDelete(jsonResponse(true, { success: true }))
      await removePromise
    })

    expect(result.current.removingId).toBeNull()
  })
})
