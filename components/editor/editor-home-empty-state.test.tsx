// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { openCreateDialogMock } = vi.hoisted(() => ({
  openCreateDialogMock: vi.fn(),
}));

vi.mock("@/components/editor/project-dialogs-provider", () => ({
  useProjectDialogsContext: () => ({ openCreateDialog: openCreateDialogMock }),
}));

import { EditorHomeEmptyState } from "./editor-home-empty-state";

describe("EditorHomeEmptyState", () => {
  it("opens the create dialog when clicked", () => {
    render(<EditorHomeEmptyState />);

    fireEvent.click(screen.getByRole("button", { name: /new project/i }));

    expect(openCreateDialogMock).toHaveBeenCalledTimes(1);
  });
});
