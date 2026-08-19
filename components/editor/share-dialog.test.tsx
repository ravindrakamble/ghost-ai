// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Collaborator } from "@/types/collaborator";
import { ShareDialog } from "./share-dialog";

const collaborator: Collaborator = {
  id: "c1",
  email: "teammate@example.com",
  name: "Ada Lovelace",
  avatarUrl: null,
};

function baseProps(overrides: Partial<React.ComponentProps<typeof ShareDialog>> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    projectId: "p1",
    isOwner: true,
    collaborators: [] as Collaborator[],
    isLoading: false,
    error: null,
    isInviting: false,
    removingId: null,
    onInvite: vi.fn().mockResolvedValue(true),
    onRemove: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const writeTextMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  writeTextMock.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ShareDialog", () => {
  it("renders nothing when closed", () => {
    render(<ShareDialog {...baseProps({ open: false })} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the invite input and remove controls for an owner", () => {
    render(<ShareDialog {...baseProps({ collaborators: [collaborator] })} />);

    expect(screen.getByLabelText(/collaborator email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /invite/i })).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove ada lovelace/i })).toBeInTheDocument();
  });

  it("hides the invite input and remove controls for a non-owner collaborator", () => {
    render(<ShareDialog {...baseProps({ collaborators: [collaborator], isOwner: false })} />);

    expect(screen.queryByLabelText(/collaborator email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /invite/i })).not.toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove ada lovelace/i })).not.toBeInTheDocument();
  });

  it("falls back to showing the raw email when no Clerk name is available", () => {
    const noName: Collaborator = { id: "c2", email: "noname@example.com", name: null, avatarUrl: null };
    render(<ShareDialog {...baseProps({ collaborators: [noName] })} />);

    expect(screen.getByText("noname@example.com")).toBeInTheDocument();
  });

  it("submits the trimmed email via onInvite and clears the input on success", async () => {
    const onInvite = vi.fn().mockResolvedValue(true);
    render(<ShareDialog {...baseProps({ onInvite })} />);

    const input = screen.getByLabelText(/collaborator email/i);
    fireEvent.change(input, { target: { value: "  new@example.com  " } });
    fireEvent.click(screen.getByRole("button", { name: /invite/i }));

    await waitFor(() => expect(onInvite).toHaveBeenCalledWith("new@example.com"));
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("calls onRemove when the remove control is clicked", async () => {
    const onRemove = vi.fn().mockResolvedValue(true);
    render(<ShareDialog {...baseProps({ collaborators: [collaborator], onRemove })} />);

    fireEvent.click(screen.getByRole("button", { name: /remove ada lovelace/i }));

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("c1"));
  });

  it("copies the project link and shows temporary 'Copied!' feedback", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ShareDialog {...baseProps()} />);

    fireEvent.click(screen.getByRole("button", { name: /copy project link/i }));

    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("/editor/p1"))
    );
    expect(await screen.findByRole("button", { name: /^copied!$/i })).toBeInTheDocument();

    vi.advanceTimersByTime(2100);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /copy project link/i })).toBeInTheDocument()
    );
  });

  it("shows a loading state while collaborators are being fetched", () => {
    render(<ShareDialog {...baseProps({ isLoading: true })} />);

    expect(screen.getByText(/loading collaborators/i)).toBeInTheDocument();
  });

  it("surfaces a list-fetch error", () => {
    render(<ShareDialog {...baseProps({ error: "Forbidden" })} />);

    expect(screen.getByText("Forbidden")).toBeInTheDocument();
  });

  it("resets the email input when the dialog is closed via its own close control", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<ShareDialog {...baseProps({ onOpenChange })} />);

    fireEvent.change(screen.getByLabelText(/collaborator email/i), {
      target: { value: "draft@example.com" },
    });
    expect(screen.getByLabelText(/collaborator email/i)).toHaveValue("draft@example.com");

    // Closing through the dialog's own close control (not an external prop
    // swap) exercises the same `onOpenChange` path a real Escape/backdrop
    // close would — see `handleOpenChange`'s doc comment in share-dialog.tsx.
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(<ShareDialog {...baseProps({ open: true, onOpenChange })} />);

    expect(screen.getByLabelText(/collaborator email/i)).toHaveValue("");
  });
});
