// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveCursors } from "./live-cursors";

// `LiveCursors` reads the list of other connections from Liveblocks'
// `useOthersConnectionIds()` (join/leave-only), then each cursor's own data
// via a per-connection `useOther()` subscription — this test only verifies
// `LiveCursors`'s own filtering/positioning logic, not that the real
// Liveblocks/React Flow SDKs work.
const { useOthersConnectionIdsMock, useOtherMock, useViewportMock, useCurrentUserIdMock } = vi.hoisted(() => ({
  useOthersConnectionIdsMock: vi.fn(),
  useOtherMock: vi.fn(),
  useViewportMock: vi.fn(),
  useCurrentUserIdMock: vi.fn(),
}));

vi.mock("@liveblocks/react/suspense", () => ({
  useOthersConnectionIds: useOthersConnectionIdsMock,
  useOther: useOtherMock,
  shallow: vi.fn(),
}));

vi.mock("@xyflow/react", () => ({
  useViewport: useViewportMock,
}));

vi.mock("@/hooks/use-current-user-id", () => ({
  useCurrentUserId: useCurrentUserIdMock,
}));

interface FakeCursorPresence {
  id: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
}

/** `useOther`'s real signature is `(connectionId, selector, isEqual)` — the
 * mock skips invoking `selector` and just hands back pre-shaped data per
 * connection ID, since the real selector's reshaping is `LiveCursors`'s own
 * implementation detail, not something this test needs to re-verify. */
function mockOthersByConnection(byConnectionId: Record<number, FakeCursorPresence>) {
  useOtherMock.mockImplementation((connectionId: number) => byConnectionId[connectionId]);
}

beforeEach(() => {
  vi.clearAllMocks();
  useViewportMock.mockReturnValue({ x: 0, y: 0, zoom: 1 });
  useCurrentUserIdMock.mockReturnValue("user_me");
});

describe("LiveCursors", () => {
  it("renders nothing when there are no other participants", () => {
    useOthersConnectionIdsMock.mockReturnValue([]);

    const { container } = render(<LiveCursors flowToScreenPosition={vi.fn()} />);

    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("renders nothing for a participant whose presence cursor is null", () => {
    useOthersConnectionIdsMock.mockReturnValue([2]);
    mockOthersByConnection({ 2: { id: "user_other", name: "Other Person", color: "#6457F9", cursor: null } });
    const flowToScreenPosition = vi.fn();

    render(<LiveCursors flowToScreenPosition={flowToScreenPosition} />);

    expect(screen.queryByText("Other Person")).not.toBeInTheDocument();
    expect(flowToScreenPosition).not.toHaveBeenCalled();
  });

  it("excludes the current user's own cursor, including a second connection of the same account", () => {
    useOthersConnectionIdsMock.mockReturnValue([2]);
    mockOthersByConnection({
      2: { id: "user_me", name: "Me (second tab)", color: "#00C8D4", cursor: { x: 10, y: 20 } },
    });

    render(<LiveCursors flowToScreenPosition={vi.fn().mockReturnValue({ x: 100, y: 200 })} />);

    expect(screen.queryByText("Me (second tab)")).not.toBeInTheDocument();
  });

  it("renders a cursor for another participant, positioned via flowToScreenPosition and colored from their presence color", () => {
    useOthersConnectionIdsMock.mockReturnValue([2]);
    mockOthersByConnection({
      2: { id: "user_other", name: "Other Person", color: "#6457F9", cursor: { x: 10, y: 20 } },
    });
    const flowToScreenPosition = vi.fn().mockReturnValue({ x: 111, y: 222 });

    render(<LiveCursors flowToScreenPosition={flowToScreenPosition} />);

    expect(flowToScreenPosition).toHaveBeenCalledWith({ x: 10, y: 20 });

    const badge = screen.getByText("Other Person");
    // jsdom doesn't resolve CSS custom properties, so the badge's own inline
    // `backgroundColor` is literally the `var(--cursor-color)` reference —
    // the wrapper assertion below is what verifies the real color value.
    expect(badge.style.backgroundColor).toBe("var(--cursor-color)");

    const wrapper = badge.parentElement as HTMLElement;
    expect(wrapper.style.transform).toBe("translate3d(111px, 222px, 0)");
    expect(wrapper.style.getPropertyValue("--cursor-color")).toBe("#6457F9");
  });

  it("renders multiple other participants' cursors, one per connection", () => {
    useOthersConnectionIdsMock.mockReturnValue([2, 3]);
    mockOthersByConnection({
      2: { id: "user_a", name: "Alice", color: "#00C8D4", cursor: { x: 1, y: 2 } },
      3: { id: "user_b", name: "Bob", color: "#F75F8F", cursor: { x: 3, y: 4 } },
    });

    render(<LiveCursors flowToScreenPosition={vi.fn().mockReturnValue({ x: 0, y: 0 })} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders the whole overlay as aria-hidden and non-interactive", () => {
    useOthersConnectionIdsMock.mockReturnValue([]);

    const { container } = render(<LiveCursors flowToScreenPosition={vi.fn()} />);

    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay).toHaveAttribute("aria-hidden");
    expect(overlay.className).toContain("pointer-events-none");
  });
});
