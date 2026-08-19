// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccessDenied } from "./access-denied";

describe("AccessDenied", () => {
  it("renders a short message and a link back to /editor", () => {
    render(<AccessDenied />);

    expect(screen.getByRole("heading", { name: /access denied/i })).toBeInTheDocument();
    expect(screen.getByText(/doesn't exist, or you don't have access/i)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /back to editor/i });
    expect(link).toHaveAttribute("href", "/editor");
  });
});
