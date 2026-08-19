import { describe, it, expect } from "vitest";
import { getCursorColor } from "./liveblocks-color";

const HEX_COLOR = /^#[0-9A-F]{6}$/i;

describe("getCursorColor", () => {
  it("is a pure function: the same user ID always returns the same color", () => {
    const first = getCursorColor("user_2xJ8vQ");
    const second = getCursorColor("user_2xJ8vQ");
    const third = getCursorColor("user_2xJ8vQ");

    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("returns a hex color from the fixed palette", () => {
    const color = getCursorColor("user_abc123");
    expect(color).toMatch(HEX_COLOR);
  });

  it("distributes different user IDs across the palette rather than collapsing to one color", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `user_${index}`);
    const colors = new Set(ids.map(getCursorColor));

    // Not asserting a specific count (hash collisions are expected and
    // fine) — just confirming it isn't trivially constant for every input.
    expect(colors.size).toBeGreaterThan(1);
  });

  it("does not throw on an empty string", () => {
    expect(() => getCursorColor("")).not.toThrow();
    expect(getCursorColor("")).toMatch(HEX_COLOR);
  });

  it("does not throw on unusual input (unicode, long strings)", () => {
    expect(() => getCursorColor("😀🚀-user-" + "x".repeat(500))).not.toThrow();
  });
});
