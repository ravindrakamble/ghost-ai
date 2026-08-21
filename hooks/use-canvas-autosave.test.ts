// @vitest-environment jsdom
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { CANVAS_AUTOSAVE_DEBOUNCE_MS, useCanvasAutosave } from "./use-canvas-autosave"
import type { CanvasEdge, CanvasNode } from "@/types/canvas"

function node(id: string): CanvasNode {
  return {
    id,
    type: "canvasNode",
    position: { x: 0, y: 0 },
    data: { label: "", color: "#1F1F1F", textColor: "#EDEDED", shape: "rectangle" },
  }
}

const noEdges: CanvasEdge[] = []

describe("useCanvasAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("starts idle and does not save before the debounce interval elapses", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() =>
      useCanvasAutosave({ projectId: "p1", nodes: [node("n1")], edges: noEdges, enabled: true }),
    )

    expect(result.current).toBe("idle")

    vi.advanceTimersByTime(CANVAS_AUTOSAVE_DEBOUNCE_MS - 1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("never schedules a save while enabled is false", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    renderHook(() =>
      useCanvasAutosave({ projectId: "p1", nodes: [node("n1")], edges: noEdges, enabled: false }),
    )

    vi.advanceTimersByTime(CANVAS_AUTOSAVE_DEBOUNCE_MS * 3)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("PUTs the current nodes/edges after the debounce interval and reports saved on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    const nodes = [node("n1")]
    const { result } = renderHook(() =>
      useCanvasAutosave({ projectId: "p1", nodes, edges: noEdges, enabled: true }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CANVAS_AUTOSAVE_DEBOUNCE_MS)
    })

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/canvas", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes, edges: noEdges }),
    })
    expect(result.current).toBe("saved")
  })

  it("reports an error status when the PUT response isn't ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    const { result } = renderHook(() =>
      useCanvasAutosave({ projectId: "p1", nodes: [node("n1")], edges: noEdges, enabled: true }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CANVAS_AUTOSAVE_DEBOUNCE_MS)
    })

    expect(result.current).toBe("error")
  })

  it("reports an error status when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

    const { result } = renderHook(() =>
      useCanvasAutosave({ projectId: "p1", nodes: [node("n1")], edges: noEdges, enabled: true }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CANVAS_AUTOSAVE_DEBOUNCE_MS)
    })

    expect(result.current).toBe("error")
  })

  it("resets the debounce timer on every nodes/edges change, saving only once after the last change", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    const { rerender } = renderHook(
      ({ nodes }: { nodes: CanvasNode[] }) =>
        useCanvasAutosave({ projectId: "p1", nodes, edges: noEdges, enabled: true }),
      { initialProps: { nodes: [node("n1")] } },
    )

    vi.advanceTimersByTime(CANVAS_AUTOSAVE_DEBOUNCE_MS - 200)
    rerender({ nodes: [node("n1"), node("n2")] })
    vi.advanceTimersByTime(CANVAS_AUTOSAVE_DEBOUNCE_MS - 200)
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
      nodes: CanvasNode[]
    }
    expect(body.nodes).toHaveLength(2)
  })

  it("discards a stale in-flight response so it can't overwrite a later save's status", async () => {
    let resolveFirst: (value: { ok: boolean }) => void = () => {}
    const firstResponse = new Promise<{ ok: boolean }>((resolve) => {
      resolveFirst = resolve
    })
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    const { result, rerender } = renderHook(
      ({ nodes }: { nodes: CanvasNode[] }) =>
        useCanvasAutosave({ projectId: "p1", nodes, edges: noEdges, enabled: true }),
      { initialProps: { nodes: [node("n1")] } },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CANVAS_AUTOSAVE_DEBOUNCE_MS)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender({ nodes: [node("n1"), node("n2")] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CANVAS_AUTOSAVE_DEBOUNCE_MS)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current).toBe("saved")

    // The first (stale) request finally resolves as a failure — it must not
    // flip the status back to "error" after the second request already
    // reported "saved".
    await act(async () => {
      resolveFirst({ ok: false })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current).toBe("saved")
  })

  it("cancels a pending debounced save on unmount", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { unmount } = renderHook(() =>
      useCanvasAutosave({ projectId: "p1", nodes: [node("n1")], edges: noEdges, enabled: true }),
    )

    unmount()
    vi.advanceTimersByTime(CANVAS_AUTOSAVE_DEBOUNCE_MS * 2)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
