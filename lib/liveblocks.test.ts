import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type GlobalWithLiveblocks = typeof globalThis & { liveblocksClient?: unknown };

function clearCachedClient() {
  delete (globalThis as GlobalWithLiveblocks).liveblocksClient;
}

describe("getLiveblocksClient", () => {
  const originalSecret = process.env.LIVEBLOCKS_SECRET_KEY;

  beforeEach(() => {
    clearCachedClient();
  });

  afterEach(() => {
    clearCachedClient();
    if (originalSecret === undefined) {
      delete process.env.LIVEBLOCKS_SECRET_KEY;
    } else {
      process.env.LIVEBLOCKS_SECRET_KEY = originalSecret;
    }
  });

  it("throws a handled error when LIVEBLOCKS_SECRET_KEY is not set", async () => {
    delete process.env.LIVEBLOCKS_SECRET_KEY;
    vi.resetModules();
    const { getLiveblocksClient } = await import("./liveblocks");

    expect(() => getLiveblocksClient()).toThrow(/LIVEBLOCKS_SECRET_KEY/);
  });

  it("does not throw at module import time even when the secret is unset", async () => {
    delete process.env.LIVEBLOCKS_SECRET_KEY;
    vi.resetModules();

    // Import itself must succeed — creation is deferred to the first call,
    // so anything that merely imports this module (e.g. `next build`'s
    // page-data collection) is unaffected by a missing secret.
    await expect(import("./liveblocks")).resolves.toBeDefined();
  });

  it("returns the same cached instance across multiple calls (singleton)", async () => {
    process.env.LIVEBLOCKS_SECRET_KEY = "sk_test_00000000000000000000";
    vi.resetModules();
    const { getLiveblocksClient } = await import("./liveblocks");

    const first = getLiveblocksClient();
    const second = getLiveblocksClient();

    expect(first).toBe(second);
  });

  it("reuses the process-wide cached client across separate module imports", async () => {
    process.env.LIVEBLOCKS_SECRET_KEY = "sk_test_00000000000000000000";
    vi.resetModules();
    const first = (await import("./liveblocks")).getLiveblocksClient();

    // Re-importing the module (e.g. a fresh require from another file)
    // should still resolve to the same cached instance via `globalThis`,
    // mirroring `lib/prisma.ts`'s dev-mode hot-reload persistence.
    vi.resetModules();
    const second = (await import("./liveblocks")).getLiveblocksClient();

    expect(first).toBe(second);
  });
});
