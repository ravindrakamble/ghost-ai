// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { NodeCommentsContext, useNodeComments, useNodeCommentsForNode } from "./use-node-comments";
import type { NodeComment } from "@/types/tasks";

// Mirrors `hooks/use-ai-chat-feed.test.ts`'s own mock shape exactly —
// `useNodeComments()` is a structural mirror of `useAiChatFeed()`.
const { useStorageMock, useSelfMock, pushSpy } = vi.hoisted(() => ({
  useStorageMock: vi.fn(),
  useSelfMock: vi.fn(),
  pushSpy: vi.fn(),
}));

vi.mock("@liveblocks/react/suspense", () => ({
  useStorage: useStorageMock,
  useSelf: useSelfMock,
  useMutation:
    (callback: (context: { storage: { get: (key: string) => { push: (item: unknown) => void } } }, ...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      callback({ storage: { get: () => ({ push: pushSpy }) } }, ...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useSelfMock.mockReturnValue("Ada");
});

describe("useNodeComments", () => {
  it("subscribes via the real useStorage mechanism and returns every valid comment in order", () => {
    const raw = [
      { id: "1", nodeId: "node-a", sender: "Ada", content: "Hi", timestamp: 1 },
      { id: "2", nodeId: "node-b", sender: "Bob", content: "Hello", timestamp: 2 },
    ];
    useStorageMock.mockReturnValue(raw);

    const { result } = renderHook(() => useNodeComments());

    expect(useStorageMock).toHaveBeenCalled();
    expect(result.current.comments).toEqual(raw);
  });

  it("filters out invalid Storage entries (missing nodeId, empty content, foreign/ai-chat-shaped payload), keeping only schema-valid comments in order", () => {
    const raw = [
      { id: "1", nodeId: "node-a", sender: "Ada", content: "Hi", timestamp: 1 },
      { id: "2", sender: "Bob", content: "Missing nodeId", timestamp: 2 },
      { id: "3", nodeId: "node-a", sender: "Ada", role: "user", content: "Hello", timestamp: 3 },
      { id: "4", nodeId: "node-a", sender: "Ada", content: "", timestamp: 4 },
    ];
    useStorageMock.mockReturnValue(raw);

    const { result } = renderHook(() => useNodeComments());

    // Entry 3 is schema-valid — Zod's default `z.object` parsing strips the
    // extra, unrecognized `role` field rather than rejecting the entry —
    // only entries 2 and 4 are dropped.
    expect(result.current.comments).toEqual([
      raw[0],
      { id: "3", nodeId: "node-a", sender: "Ada", content: "Hello", timestamp: 3 },
    ]);
  });

  it("does not crash and returns an empty list when Storage is empty", () => {
    useStorageMock.mockReturnValue([]);

    const { result } = renderHook(() => useNodeComments());

    expect(result.current.comments).toEqual([]);
  });

  describe("sendComment", () => {
    it("validates and pushes a well-formed outgoing comment, resolving sender from useSelf().info.name", () => {
      useStorageMock.mockReturnValue([]);
      useSelfMock.mockReturnValue("Ada");

      const { result } = renderHook(() => useNodeComments());
      result.current.sendComment("node-a", "Looks good");

      expect(pushSpy).toHaveBeenCalledTimes(1);
      const pushed = pushSpy.mock.calls[0]?.[0] as {
        id: string;
        nodeId: string;
        sender: string;
        content: string;
        timestamp: number;
      };
      expect(pushed).toMatchObject({ nodeId: "node-a", sender: "Ada", content: "Looks good" });
      expect(typeof pushed.id).toBe("string");
      expect(pushed.id.length).toBeGreaterThan(0);
      expect(typeof pushed.timestamp).toBe("number");
    });

    it("throws before mutating when the outgoing content fails schema validation (empty content)", () => {
      useStorageMock.mockReturnValue([]);

      const { result } = renderHook(() => useNodeComments());

      expect(() => result.current.sendComment("node-a", "")).toThrow();
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it("generates a different id for each call", () => {
      useStorageMock.mockReturnValue([]);

      const { result } = renderHook(() => useNodeComments());
      result.current.sendComment("node-a", "first");
      result.current.sendComment("node-a", "second");

      const [firstId] = pushSpy.mock.calls[0] as [{ id: string }];
      const [secondId] = pushSpy.mock.calls[1] as [{ id: string }];
      expect(firstId.id).not.toBe(secondId.id);
    });

    it("scopes the pushed comment to the given nodeId", () => {
      useStorageMock.mockReturnValue([]);

      const { result } = renderHook(() => useNodeComments());
      result.current.sendComment("node-b", "scoped comment");

      const [pushed] = pushSpy.mock.calls[0] as [{ nodeId: string }];
      expect(pushed.nodeId).toBe("node-b");
    });
  });
});

describe("useNodeCommentsForNode", () => {
  function makeComment(overrides: Partial<NodeComment>): NodeComment {
    return { id: "1", nodeId: "node-a", sender: "Ada", content: "Hi", timestamp: 1, ...overrides };
  }

  function wrapperFor(value: { comments: NodeComment[]; sendComment: (nodeId: string, content: string) => void } | null) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <NodeCommentsContext.Provider value={value}>{children}</NodeCommentsContext.Provider>;
    };
  }

  it("filters the full comment list down to just the given nodeId", () => {
    const comments = [
      makeComment({ id: "1", nodeId: "node-a" }),
      makeComment({ id: "2", nodeId: "node-b" }),
      makeComment({ id: "3", nodeId: "node-a" }),
    ];
    const sendComment = vi.fn();

    const { result } = renderHook(() => useNodeCommentsForNode("node-a"), {
      wrapper: wrapperFor({ comments, sendComment }),
    });

    expect(result.current.comments.map((comment) => comment.id)).toEqual(["1", "3"]);
  });

  it("binds sendComment to the given nodeId", () => {
    const sendComment = vi.fn();

    const { result } = renderHook(() => useNodeCommentsForNode("node-a"), {
      wrapper: wrapperFor({ comments: [], sendComment }),
    });

    result.current.sendComment("a reply");

    expect(sendComment).toHaveBeenCalledWith("node-a", "a reply");
  });

  it("returns an empty list and a throwing sendComment stub with no provider in the tree", () => {
    const { result } = renderHook(() => useNodeCommentsForNode("node-a"));

    expect(result.current.comments).toEqual([]);
    expect(() => result.current.sendComment("too soon")).toThrow();
  });
});
