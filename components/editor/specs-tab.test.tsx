// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpecsTab } from "./specs-tab";

describe("SpecsTab", () => {
  it("renders an enabled-looking Generate Spec button with no data fetching", () => {
    render(<SpecsTab />);

    const generateButton = screen.getByRole("button", { name: /generate spec/i });
    expect(generateButton).not.toBeDisabled();
  });

  it("renders exactly one static demo spec card with a disabled download action", () => {
    render(<SpecsTab />);

    expect(screen.getByText("System Design Spec")).toBeInTheDocument();

    const downloadButton = screen.getByRole("button", { name: /download spec/i });
    expect(downloadButton).toBeDisabled();

    // Exactly one demo card: exactly one download button and one title.
    expect(screen.getAllByRole("button", { name: /download spec/i })).toHaveLength(1);
  });

  it("uses only token-based classes, no raw hex or Tailwind color classes", () => {
    const { container } = render(<SpecsTab />);
    const html = container.innerHTML;

    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(html).not.toMatch(/\b(?:bg|text|border)-(?:white|black|zinc|gray|slate)-?\d*\b/);
  });
});
