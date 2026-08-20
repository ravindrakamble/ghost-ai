// @vitest-environment jsdom
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { CanvasNodeUpdateContext, useUpdateCanvasNode } from "./use-update-canvas-node"

describe("useUpdateCanvasNode", () => {
  it("returns null when rendered outside CanvasNodeUpdateContext.Provider", () => {
    const { result } = renderHook(() => useUpdateCanvasNode())
    expect(result.current).toBeNull()
  })

  it("returns the provided update function when wrapped in the provider", () => {
    const updateNodeData = vi.fn()
    function wrapper({ children }: { children: ReactNode }) {
      return (
        <CanvasNodeUpdateContext.Provider value={updateNodeData}>{children}</CanvasNodeUpdateContext.Provider>
      )
    }

    const { result } = renderHook(() => useUpdateCanvasNode(), { wrapper })
    expect(result.current).toBe(updateNodeData)

    result.current?.("node-1", { label: "New" })
    expect(updateNodeData).toHaveBeenCalledWith("node-1", { label: "New" })
  })
})
