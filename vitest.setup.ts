import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest isn't configured with `test.globals: true`, so React Testing
// Library's auto-cleanup (which detects the Jest/Vitest global `afterEach`)
// doesn't kick in on its own — wire it up explicitly so component tests
// with multiple `it` blocks in one file don't leak DOM between renders.
afterEach(() => {
  cleanup();
});
