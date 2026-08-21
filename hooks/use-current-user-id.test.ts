// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCurrentUserId } from "./use-current-user-id";

const { useUserMock } = vi.hoisted(() => ({ useUserMock: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({
  useUser: useUserMock,
}));

describe("useCurrentUserId", () => {
  it("returns the Clerk user's id when signed in", () => {
    useUserMock.mockReturnValue({ user: { id: "user_123" } });

    const { result } = renderHook(() => useCurrentUserId());

    expect(result.current).toBe("user_123");
  });

  it("returns undefined when there is no user yet (loading or signed out)", () => {
    useUserMock.mockReturnValue({ user: null });

    const { result } = renderHook(() => useCurrentUserId());

    expect(result.current).toBeUndefined();
  });
});
