// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkspaceShell } from "./workspace-shell";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ collaborators: [] }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkspaceShell", () => {
  it("renders the project name, canvas placeholder, and a closed AI sidebar by default", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    expect(screen.getByRole("heading", { name: "Project One" })).toBeInTheDocument();
    expect(screen.getByText(/canvas coming soon/i)).toBeInTheDocument();

    const aiSidebar = screen.getByText(/ai chat is coming soon/i).closest("aside");
    expect(aiSidebar).toHaveAttribute("aria-hidden", "true");
  });

  it("toggles the AI sidebar placeholder open and closed", () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    const toggle = screen.getByRole("button", { name: /toggle ai sidebar/i });
    const aiSidebar = screen.getByText(/ai chat is coming soon/i).closest("aside");

    fireEvent.click(toggle);
    expect(aiSidebar).toHaveAttribute("aria-hidden", "false");

    fireEvent.click(toggle);
    expect(aiSidebar).toHaveAttribute("aria-hidden", "true");
  });

  it("opens the Share dialog when the Share button is clicked", async () => {
    render(<WorkspaceShell project={{ id: "p1", name: "Project One" }} isOwner={true} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const shareButton = screen.getByRole("button", { name: /share/i });
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /share project/i })).toBeInTheDocument();
  });
});
