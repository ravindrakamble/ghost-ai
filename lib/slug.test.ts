import { describe, it, expect } from "vitest";
import { generateShortSuffix, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Checkout Service")).toBe("checkout-service");
  });

  it("collapses non-alphanumeric runs into a single hyphen", () => {
    expect(slugify("Partner   API / Gateway!!")).toBe("partner-api-gateway");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Notification Pipeline--  ")).toBe("notification-pipeline");
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(slugify("   ")).toBe("");
  });
});

describe("generateShortSuffix", () => {
  it("defaults to a 6-character lowercase alphanumeric string", () => {
    const suffix = generateShortSuffix();
    expect(suffix).toMatch(/^[a-z0-9]{6}$/);
  });

  it("respects a custom length", () => {
    expect(generateShortSuffix(10)).toHaveLength(10);
  });

  it("generates different values across calls", () => {
    const suffixes = new Set(Array.from({ length: 20 }, () => generateShortSuffix()));
    expect(suffixes.size).toBeGreaterThan(1);
  });
});
