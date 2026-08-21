"use client"

import { useUser } from "@clerk/nextjs"

/**
 * Resolves the current user's Clerk ID from the active Clerk session
 * (`useUser()`, not Liveblocks' `useSelf()`) — spec 19's Analyst Brief,
 * Concrete deliverables, is specific that the current user's ID comes from
 * the Clerk session, even though both resolve to the same string today
 * (`app/api/liveblocks-auth/route.ts` passes `caller.id`, the Clerk user ID,
 * as the Liveblocks session's user ID).
 *
 * Shared by `PresenceAvatars` and `LiveCursors` (spec 19's Analyst Brief,
 * Open Questions #3) so both surfaces exclude the current user's own
 * presence entry with the exact same rule: a Liveblocks "other" whose `id`
 * matches this value is the current user, even from a second browser tab —
 * `useOthers()`/`useOther()` only ever exclude the current *connection*, not
 * a second connection belonging to the same authenticated account.
 */
export function useCurrentUserId(): string | undefined {
  const { user } = useUser()
  return user?.id
}
