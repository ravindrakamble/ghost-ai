// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AiSidebar } from "./ai-sidebar";

describe("AiSidebar", () => {
  it("renders the header (bot icon, title, subtitle) and preserves the floating/slide/border treatment", () => {
    render(<AiSidebar isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText("AI Workspace")).toBeInTheDocument();
    expect(screen.getByText("Collaborate with Ghost AI")).toBeInTheDocument();

    const aside = screen.getByText("AI Workspace").closest("aside") as HTMLElement;
    expect(aside.className).toContain("absolute");
    expect(aside.className).toContain("top-0");
    expect(aside.className).toContain("right-0");
    expect(aside.className).toContain("h-full");
    expect(aside.className).toContain("w-80");
    expect(aside.className).toContain("border-l");
    expect(aside.className).toContain("border-surface-border");
    expect(aside.className).toContain("bg-elevated/95");
    expect(aside.className).toContain("backdrop-blur");
    expect(aside.className).toContain("duration-200");
    expect(aside.className).toContain("ease-in-out");
    expect(aside.className).toContain("translate-x-0");
    expect(aside).toHaveAttribute("aria-hidden", "false");
  });

  it("reflects isOpen via translate transform and aria-hidden when closed", () => {
    render(<AiSidebar isOpen={false} onClose={vi.fn()} />);

    const aside = screen.getByText("AI Workspace").closest("aside") as HTMLElement;
    expect(aside.className).toContain("translate-x-full");
    expect(aside).toHaveAttribute("aria-hidden", "true");
  });

  it("calls onClose when the header close button is clicked", () => {
    const onClose = vi.fn();
    render(<AiSidebar isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /close ai sidebar/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders exactly two tabs, AI Architect and Specs, with AI Architect active by default", () => {
    render(<AiSidebar isOpen={true} onClose={vi.fn()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent("AI Architect");
    expect(tabs[1]).toHaveTextContent("Specs");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });

  it("switches to the Specs tab content on click, distinguishing the active tab via tokens", () => {
    render(<AiSidebar isOpen={true} onClose={vi.fn()} />);

    const architectTab = screen.getByRole("tab", { name: "AI Architect" });
    const specsTab = screen.getByRole("tab", { name: "Specs" });
    fireEvent.click(specsTab);

    expect(specsTab).toHaveAttribute("aria-selected", "true");
    // Regression coverage for the QA-reported bug: the active/inactive
    // pairing must be applied via the SAME modifier prefixes
    // `components/ui/tabs.tsx`'s own base classes use — both plain
    // `data-active:` (vs. the base's `data-active:bg-background
    // data-active:text-foreground`) AND `dark:data-active:` (vs. the base's
    // `dark:data-active:bg-input/30 dark:data-active:text-foreground`, which
    // this app's always-on `.dark` class on `<html>` makes just as live as
    // the plain pair) — otherwise tailwind-merge doesn't treat the override
    // as being in the same conflict group and the base's rule(s) silently
    // win the cascade instead, exactly as QA verified via real computed
    // styles in a built + Playwright-rendered page.
    expect(specsTab.className).toContain("data-active:bg-accent-dim");
    expect(specsTab.className).toContain("data-active:text-brand");
    expect(specsTab.className).toContain("dark:data-active:bg-accent-dim");
    expect(specsTab.className).toContain("dark:data-active:text-brand");
    // Base UI actually sets the `data-active` attribute on the selected tab
    // (and only the selected tab) — confirms the selector these classes key
    // off actually matches the real DOM state, not just a string in className.
    expect(specsTab).toHaveAttribute("data-active");
    expect(architectTab).not.toHaveAttribute("data-active");
    expect(screen.getByRole("button", { name: /generate spec/i })).toBeInTheDocument();
  });

  it("has no Liveblocks, /api/ai, or Trigger.dev references anywhere in its rendered output", () => {
    const { container } = render(<AiSidebar isOpen={true} onClose={vi.fn()} />);
    const html = container.innerHTML;

    expect(html).not.toMatch(/liveblocks/i);
    expect(html).not.toMatch(/\/api\/ai/i);
    expect(html).not.toMatch(/trigger\.dev/i);
  });
});
