// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAiChatFeed } from "./use-ai-chat-feed";

// `useMutation`'s real signature is `(callback, deps) => (...args) => callback(context,
// ...args)` — this mock captures the callback and invokes it against a fake
// `{ storage }` context (a `.get("messages")` returning a spy-able `.push`),
// without depending on a real Liveblocks room connection.
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
  useSelfMock.mockReturnValue({ info: { name: "Ada" } });
});

describe("useAiChatFeed", () => {
  it("subscribes via the real useStorage mechanism and returns every valid message in order", () => {
    const raw = [
      { id: "1", sender: "Ada", role: "user", content: "Hi", timestamp: 1 },
      { id: "2", sender: "Bot", role: "assistant", content: "Hello", timestamp: 2 },
    ];
    useStorageMock.mockReturnValue(raw);

    const { result } = renderHook(() => useAiChatFeed());

    expect(useStorageMock).toHaveBeenCalled();
    expect(result.current.messages).toEqual(raw);
  });

  it("filters out invalid Storage entries (bad role, foreign/ai-status-feed-shaped payload, empty content), keeping only schema-valid messages in order", () => {
    const raw = [
      { id: "1", sender: "Ada", role: "user", content: "Hi", timestamp: 1 },
      { id: "2", sender: "Bot", role: "bogus-role", content: "Hello", timestamp: 2 },
      { stage: "processing", text: "not a chat message" },
      { id: "4", sender: "Ada", role: "user", content: "", timestamp: 4 },
    ];
    useStorageMock.mockReturnValue(raw);

    const { result } = renderHook(() => useAiChatFeed());

    expect(result.current.messages).toEqual([raw[0]]);
  });

  it("does not crash and returns an empty list when Storage is empty", () => {
    useStorageMock.mockReturnValue([]);

    const { result } = renderHook(() => useAiChatFeed());

    expect(result.current.messages).toEqual([]);
  });

  describe("sendMessage", () => {
    it("validates and pushes a well-formed outgoing message, resolving sender from useSelf().info.name with role 'user'", () => {
      useStorageMock.mockReturnValue([]);
      useSelfMock.mockReturnValue({ info: { name: "Ada" } });

      const { result } = renderHook(() => useAiChatFeed());
      result.current.sendMessage("Design a queue");

      expect(pushSpy).toHaveBeenCalledTimes(1);
      const pushed = pushSpy.mock.calls[0]?.[0] as {
        id: string;
        sender: string;
        role: string;
        content: string;
        timestamp: number;
      };
      expect(pushed).toMatchObject({ sender: "Ada", role: "user", content: "Design a queue" });
      expect(typeof pushed.id).toBe("string");
      expect(pushed.id.length).toBeGreaterThan(0);
      expect(typeof pushed.timestamp).toBe("number");
    });

    it("throws before mutating when the outgoing content fails schema validation (empty content)", () => {
      useStorageMock.mockReturnValue([]);

      const { result } = renderHook(() => useAiChatFeed());

      expect(() => result.current.sendMessage("")).toThrow();
      expect(pushSpy).not.toHaveBeenCalled();
    });

    it("generates a different id for each call", () => {
      useStorageMock.mockReturnValue([]);

      const { result } = renderHook(() => useAiChatFeed());
      result.current.sendMessage("first");
      result.current.sendMessage("second");

      const [firstId] = pushSpy.mock.calls[0] as [{ id: string }];
      const [secondId] = pushSpy.mock.calls[1] as [{ id: string }];
      expect(firstId.id).not.toBe(secondId.id);
    });
  });
});
