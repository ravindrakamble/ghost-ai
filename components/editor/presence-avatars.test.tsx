// @vitest-environment jsdom
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PresenceAvatars } from "./presence-avatars";

// `PresenceAvatars` reads the current user's ID from Clerk's `useUser()`
// (spec 19's Analyst Brief, Concrete deliverables — deliberately not
// Liveblocks' `useSelf()`) and the collaborator list from Liveblocks'
// `useOthers()`, narrowed with the `shallow` comparator. This test only
// verifies `PresenceAvatars`'s own filtering/rendering logic, not that the
// real Liveblocks/Clerk SDKs work.
const { useOthersMock, userButtonPropsRef, useUserMock } = vi.hoisted(() => ({
  useOthersMock: vi.fn(),
  userButtonPropsRef: { current: null as Record<string, unknown> | null },
  useUserMock: vi.fn(),
}));

vi.mock("@liveblocks/react/suspense", () => ({
  useOthers: useOthersMock,
  shallow: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: useUserMock,
  UserButton: (props: Record<string, unknown>) => {
    userButtonPropsRef.current = props;
    return <div data-testid="user-button" />;
  },
}));

interface FakeOther {
  id: string;
  connectionId: number;
  info: { name: string; avatar: string; color: string };
}

function makeOther(id: string, connectionId: number, name: string): FakeOther {
  return { id, connectionId, info: { name, avatar: `https://example.com/${id}.png`, color: "#00C8D4" } };
}

function mockOthers(list: FakeOther[]) {
  useOthersMock.mockImplementation(
    (selector: (others: FakeOther[]) => unknown) => selector(list) as ReactNode,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  userButtonPropsRef.current = null;
  useUserMock.mockReturnValue({ user: { id: "user_me" } });
  mockOthers([]);
});

describe("PresenceAvatars", () => {
  it("renders only the UserButton, with no divider, when there are no collaborators", () => {
    mockOthers([]);
    const { container } = render(<PresenceAvatars />);

    expect(screen.getByTestId("user-button")).toBeInTheDocument();
    expect(container.querySelector(".bg-surface-border")).not.toBeInTheDocument();
  });

  it("excludes the current user's own presence entry by Clerk ID, including a second connection of the same account", () => {
    mockOthers([
      makeOther("user_me", 2, "Me (second tab)"),
      makeOther("user_other", 3, "Other Person"),
    ]);

    render(<PresenceAvatars />);

    expect(screen.queryByTitle("Me (second tab)")).not.toBeInTheDocument();
    expect(screen.getByTitle("Other Person")).toBeInTheDocument();
  });

  it("renders a divider between the collaborator stack and UserButton only when at least one collaborator is present", () => {
    mockOthers([makeOther("user_other", 3, "Other Person")]);
    const { container } = render(<PresenceAvatars />);

    expect(container.querySelector(".bg-surface-border")).toBeInTheDocument();
  });

  it("shows at most 5 collaborator avatars in the stack and a +N chip for the remainder", () => {
    const others = Array.from({ length: 7 }, (_, index) => makeOther(`user_${index}`, index + 1, `User ${index}`));
    mockOthers(others);

    render(<PresenceAvatars />);

    for (let index = 0; index < 5; index += 1) {
      expect(screen.getByTitle(`User ${index}`)).toBeInTheDocument();
    }
    expect(screen.queryByTitle("User 5")).not.toBeInTheDocument();
    expect(screen.queryByTitle("User 6")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("passes a fixed avatarBox size to UserButton via its appearance prop, not a wrapping className", () => {
    render(<PresenceAvatars />);

    expect(userButtonPropsRef.current).toMatchObject({
      appearance: { elements: { userButtonAvatarBox: expect.stringContaining("h-8") } },
    });
  });

  it("renders no interactive affordances on collaborator avatars — no buttons, links, or click handlers", () => {
    mockOthers([makeOther("user_other", 3, "Other Person")]);
    render(<PresenceAvatars />);

    // Only the UserButton's own mocked element should exist — no button/link
    // role anywhere else in the overlay.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
