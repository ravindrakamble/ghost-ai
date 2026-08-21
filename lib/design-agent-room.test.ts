import { describe, it, expect, vi, beforeEach } from "vitest"
import type { DesignAgentAction } from "@/lib/design-agent-ai"

const {
  getLiveblocksClientMock,
  mutateStorageMock,
  broadcastEventMock,
  setPresenceMock,
  getStorageDocumentMock,
  mutateFlowMock,
} = vi.hoisted(() => ({
  getLiveblocksClientMock: vi.fn(),
  mutateStorageMock: vi.fn(),
  broadcastEventMock: vi.fn(),
  setPresenceMock: vi.fn(),
  getStorageDocumentMock: vi.fn(),
  mutateFlowMock: vi.fn(),
}))

vi.mock("@/lib/liveblocks", () => ({
  getLiveblocksClient: getLiveblocksClientMock,
}))

vi.mock("@liveblocks/react-flow/node", () => ({
  mutateFlow: mutateFlowMock,
}))

import {
  applyDesignAgentActions,
  broadcastDesignAgentStatus,
  clearDesignAgentPresence,
  getCurrentDesignGraph,
  setDesignAgentPresence,
  GHOST_AI_USER_ID,
} from "./design-agent-room"

const fakeClient = {
  mutateStorage: mutateStorageMock,
  broadcastEvent: broadcastEventMock,
  setPresence: setPresenceMock,
  getStorageDocument: getStorageDocumentMock,
}

beforeEach(() => {
  vi.clearAllMocks()
  getLiveblocksClientMock.mockReturnValue(fakeClient)
})

describe("broadcastDesignAgentStatus", () => {
  it("broadcasts the message via getLiveblocksClient().broadcastEvent", async () => {
    await broadcastDesignAgentStatus("room-1", { stage: "start", text: "hi" })

    expect(getLiveblocksClientMock).toHaveBeenCalled()
    expect(broadcastEventMock).toHaveBeenCalledWith("room-1", { stage: "start", text: "hi" })
  })
})

describe("setDesignAgentPresence / clearDesignAgentPresence", () => {
  it("sets presence with the fixed Ghost AI identity, the given thinking/cursor data, and a 60s active ttl", async () => {
    await setDesignAgentPresence("room-1", { thinking: true, cursor: { x: 1, y: 2 } })

    expect(setPresenceMock).toHaveBeenCalledWith("room-1", {
      userId: GHOST_AI_USER_ID,
      data: { thinking: true, cursor: { x: 1, y: 2 } },
      userInfo: { name: "Ghost AI", color: "#6457f9", avatar: "" },
      ttl: 60,
    })
  })

  it("clears presence to thinking:false/cursor:null with a short (minimum-allowed) ttl", async () => {
    await clearDesignAgentPresence("room-1")

    expect(setPresenceMock).toHaveBeenCalledWith("room-1", {
      userId: GHOST_AI_USER_ID,
      data: { thinking: false, cursor: null },
      userInfo: { name: "Ghost AI", color: "#6457f9", avatar: "" },
      ttl: 2,
    })
  })

  it("uses the same fixed userId across calls, never a per-run identity", async () => {
    await setDesignAgentPresence("room-1", { thinking: true, cursor: null })
    await clearDesignAgentPresence("room-1")

    const userIds = setPresenceMock.mock.calls.map((call: unknown[]) => (call[1] as { userId: string }).userId)
    expect(new Set(userIds).size).toBe(1)
    expect(userIds[0]).toBe("ghost-ai-agent")
  })
})

describe("getCurrentDesignGraph", () => {
  it("returns an empty graph when the room has no flow key yet", async () => {
    getStorageDocumentMock.mockResolvedValue({})

    const graph = await getCurrentDesignGraph("room-1")

    expect(graph).toEqual({ nodes: [], edges: [] })
    expect(getStorageDocumentMock).toHaveBeenCalledWith("room-1", "json")
  })

  it("returns an empty graph for a malformed document shape", async () => {
    getStorageDocumentMock.mockResolvedValue(null)
    expect(await getCurrentDesignGraph("room-1")).toEqual({ nodes: [], edges: [] })
  })

  it("parses real nodes/edges out of the storage document's flow key", async () => {
    getStorageDocumentMock.mockResolvedValue({
      flow: {
        nodes: {
          "node-1": {
            id: "node-1",
            type: "canvasNode",
            position: { x: 10, y: 20 },
            width: 160,
            height: 80,
            data: { label: "API Gateway", color: "#1F1F1F", textColor: "#EDEDED", shape: "rectangle" },
          },
        },
        edges: {
          "edge-1": {
            id: "edge-1",
            type: "canvasEdge",
            source: "node-1",
            target: "node-1",
            data: { label: "self" },
          },
        },
      },
    })

    const graph = await getCurrentDesignGraph("room-1")

    expect(graph).toEqual({
      nodes: [{ id: "node-1", label: "API Gateway", shape: "rectangle", x: 10, y: 20 }],
      edges: [{ id: "edge-1", sourceNodeId: "node-1", targetNodeId: "node-1", label: "self" }],
    })
  })

  it("skips a node with a missing/invalid position instead of throwing", async () => {
    getStorageDocumentMock.mockResolvedValue({
      flow: { nodes: { broken: { id: "broken", data: {} } }, edges: {} },
    })

    expect(await getCurrentDesignGraph("room-1")).toEqual({ nodes: [], edges: [] })
  })

  it("falls back to 'rectangle' for a node whose data.shape isn't a real NodeShape", async () => {
    getStorageDocumentMock.mockResolvedValue({
      flow: {
        nodes: {
          n1: { id: "n1", position: { x: 0, y: 0 }, data: { shape: "triangle", label: "X" } },
        },
        edges: {},
      },
    })

    const graph = await getCurrentDesignGraph("room-1")
    expect(graph.nodes[0]).toEqual({ id: "n1", label: "X", shape: "rectangle", x: 0, y: 0 })
  })

  it("propagates a genuine upstream failure rather than silently returning an empty graph", async () => {
    getStorageDocumentMock.mockRejectedValue(new Error("liveblocks down"))
    await expect(getCurrentDesignGraph("room-1")).rejects.toThrow("liveblocks down")
  })
})

describe("applyDesignAgentActions", () => {
  function makeFlowSpy() {
    return {
      addNode: vi.fn(),
      updateNode: vi.fn(),
      updateNodeData: vi.fn(),
      removeNode: vi.fn(),
      addEdge: vi.fn(),
      removeEdge: vi.fn(),
    }
  }

  it("does nothing (no mutateFlow call) for an empty action batch", async () => {
    await applyDesignAgentActions("room-1", [])
    expect(mutateFlowMock).not.toHaveBeenCalled()
  })

  it("applies the full batch inside a single mutateFlow call, dispatching each action kind to the right flow method", async () => {
    const flowSpy = makeFlowSpy()
    mutateFlowMock.mockImplementation(async (_options: unknown, callback: (flow: typeof flowSpy) => void) => {
      callback(flowSpy)
    })

    const actions: DesignAgentAction[] = [
      {
        kind: "addNode",
        nodeId: "n1",
        shape: "rectangle",
        label: "Gateway",
        color: "#1F1F1F",
        textColor: "#EDEDED",
        width: 160,
        height: 80,
        x: 0,
        y: 0,
      },
      { kind: "moveNode", nodeId: "n2", x: 5, y: 10 },
      { kind: "resizeNode", nodeId: "n3", width: 200, height: 90 },
      { kind: "updateNodeData", nodeId: "n4", label: "Renamed" },
      { kind: "deleteNode", nodeId: "n5" },
      { kind: "addEdge", edgeId: "e1", sourceNodeId: "n1", targetNodeId: "n2", label: "calls" },
      { kind: "deleteEdge", edgeId: "e2" },
    ]

    await applyDesignAgentActions("room-1", actions)

    expect(mutateFlowMock).toHaveBeenCalledTimes(1)
    const [options] = mutateFlowMock.mock.calls[0] as [{ roomId: string }, unknown]
    expect(options.roomId).toBe("room-1")

    expect(flowSpy.addNode).toHaveBeenCalledWith({
      id: "n1",
      type: "canvasNode",
      position: { x: 0, y: 0 },
      width: 160,
      height: 80,
      data: { label: "Gateway", color: "#1F1F1F", textColor: "#EDEDED", shape: "rectangle" },
    })
    expect(flowSpy.updateNode).toHaveBeenCalledWith("n2", { position: { x: 5, y: 10 } })
    expect(flowSpy.updateNode).toHaveBeenCalledWith("n3", { width: 200, height: 90 })
    expect(flowSpy.updateNodeData).toHaveBeenCalledWith("n4", { label: "Renamed" })
    expect(flowSpy.removeNode).toHaveBeenCalledWith("n5")
    expect(flowSpy.addEdge).toHaveBeenCalledWith({
      id: "e1",
      type: "canvasEdge",
      source: "n1",
      target: "n2",
      data: { label: "calls" },
    })
    expect(flowSpy.removeEdge).toHaveBeenCalledWith("e2")
  })

  it("propagates a genuine mutateFlow failure rather than swallowing it", async () => {
    mutateFlowMock.mockRejectedValue(new Error("mutateStorage failed"))

    await expect(applyDesignAgentActions("room-1", [{ kind: "deleteNode", nodeId: "n1" }])).rejects.toThrow(
      "mutateStorage failed",
    )
  })
})
