// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAiStatusFeed } from "./use-ai-status-feed";

// `useEventListener`'s real signature is `(callback: (data: { event, user,
// connectionId }) => void) => void` — this mock captures whatever callback
// the hook registers so tests can simulate a broadcast arriving, without
// depending on a real Liveblocks room connection.
const { useEventListenerMock } = vi.hoisted(() => ({
  useEventListenerMock: vi.fn(),
}));

vi.mock("@liveblocks/react/suspense", () => ({
  useEventListener: useEventListenerMock,
}));

type Callback = (data: { event: unknown }) => void;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAiStatusFeed", () => {
  it("subscribes via the real useEventListener mechanism and starts with null", () => {
    const { result } = renderHook(() => useAiStatusFeed());

    expect(useEventListenerMock).toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("keeps only the latest valid message", () => {
    let callback: Callback = () => {};
    useEventListenerMock.mockImplementation((cb: Callback) => {
      callback = cb;
    });

    const { result } = renderHook(() => useAiStatusFeed());

    act(() => {
      callback({ event: { stage: "start", text: "Starting…" } });
    });
    expect(result.current).toEqual({ stage: "start", text: "Starting…" });

    act(() => {
      callback({ event: { stage: "processing", text: "Interpreting…" } });
    });
    expect(result.current).toEqual({ stage: "processing", text: "Interpreting…" });

    act(() => {
      callback({ event: { stage: "complete", text: "Done" } });
    });
    expect(result.current).toEqual({ stage: "complete", text: "Done" });
  });

  it("drops an invalid broadcast, keeping the previous valid message", () => {
    let callback: Callback = () => {};
    useEventListenerMock.mockImplementation((cb: Callback) => {
      callback = cb;
    });

    const { result } = renderHook(() => useAiStatusFeed());

    act(() => {
      callback({ event: { stage: "start", text: "Starting…" } });
    });
    expect(result.current).toEqual({ stage: "start", text: "Starting…" });

    act(() => {
      callback({ event: { stage: "not-a-real-stage" } });
    });
    expect(result.current).toEqual({ stage: "start", text: "Starting…" });

    act(() => {
      callback({ event: "a foreign, unrelated broadcast payload" });
    });
    expect(result.current).toEqual({ stage: "start", text: "Starting…" });
  });

  it("accepts a message with no text field", () => {
    let callback: Callback = () => {};
    useEventListenerMock.mockImplementation((cb: Callback) => {
      callback = cb;
    });

    const { result } = renderHook(() => useAiStatusFeed());

    act(() => {
      callback({ event: { stage: "error" } });
    });
    expect(result.current).toEqual({ stage: "error" });
  });
});
