// @vitest-environment jsdom
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { CanvasEdgeUpdateContext, useUpdateCanvasEdge } from "./use-update-canvas-edge"

describe("useUpdateCanvasEdge", () => {
  it("returns null when rendered outside CanvasEdgeUpdateContext.Provider", () => {
    const { result } = renderHook(() => useUpdateCanvasEdge())
    expect(result.current).toBeNull()
  })

  it("returns the provided update function when wrapped in the provider", () => {
    const updateEdgeData = vi.fn()
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <CanvasEdgeUpdateContext.Provider value={updateEdgeData}>{children}</CanvasEdgeUpdateContext.Provider>
      )
    }

    const { result } = renderHook(() => useUpdateCanvasEdge(), { wrapper })
    expect(result.current).toBe(updateEdgeData)

    result.current?.("edge-1", { label: "New" })
    expect(updateEdgeData).toHaveBeenCalledWith("edge-1", { label: "New" })
  })
})
