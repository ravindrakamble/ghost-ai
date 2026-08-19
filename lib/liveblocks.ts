import { Liveblocks } from "@liveblocks/node";

const globalForLiveblocks = globalThis as unknown as { liveblocksClient?: Liveblocks };

function createLiveblocksClient(): Liveblocks {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "LIVEBLOCKS_SECRET_KEY is not set. Add it to the environment to issue Liveblocks session tokens.",
    );
  }

  return new Liveblocks({ secret });
}

/**
 * Returns a cached Liveblocks Node client, instantiated once per process —
 * same singleton pattern as `lib/prisma.ts`.
 *
 * Unlike `lib/prisma.ts`, creation is deferred to first call rather than
 * evaluated eagerly at module load. `LIVEBLOCKS_SECRET_KEY` is not
 * guaranteed to be present in every environment this module gets imported
 * into (see spec 10's Open Questions #2) — eagerly throwing at import time
 * would take down anything that merely imports this module (including
 * `next build`'s page-data collection step), rather than surfacing as a
 * handled error only from the one route that actually needs a live key.
 */
export function getLiveblocksClient(): Liveblocks {
  const cached = globalForLiveblocks.liveblocksClient;
  if (cached) {
    return cached;
  }

  const client = createLiveblocksClient();
  globalForLiveblocks.liveblocksClient = client;
  return client;
}
