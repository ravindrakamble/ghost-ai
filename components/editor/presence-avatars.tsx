"use client"

import { UserButton } from "@clerk/nextjs"
import { shallow, useOthers } from "@liveblocks/react/suspense"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useCurrentUserId } from "@/hooks/use-current-user-id"

/** At most 5 collaborator avatars render in the overlapping stack; any
 * remainder collapses into a single "+N" chip — spec 19's Analyst Brief,
 * Concrete deliverables. */
const MAX_VISIBLE_COLLABORATORS = 5

/** Both the collaborator avatars and the Clerk `UserButton` render at this
 * same fixed size (spec 19's acceptance criterion 9) — `UserButton` can only
 * be sized via its own `appearance` prop (see below), not a wrapping
 * className, so this class name is applied to both independently rather
 * than shared through a CSS class alone. */
const AVATAR_SIZE_CLASS = "h-8 w-8"

interface PresenceCollaborator {
  id: string
  info: { name: string; avatar: string; color: string }
}

/** Derives up to two initials from a display name for `AvatarFallback` —
 * shadcn's `Avatar` already falls back to this automatically when
 * `AvatarImage` has no `src` or fails to load (spec 19's Analyst Brief, Open
 * Questions #4), so this only needs to produce the fallback's own content. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return (first + last).toUpperCase() || "?"
}

/**
 * Top-right collaborator avatar stack + the existing Clerk `UserButton`,
 * rendered inside the canvas view only (a sibling of `<ReactFlow>` in
 * `CanvasFlow`) — spec 19. Display-only: no click handlers, no hover cards,
 * no href, per the spec's Scope Limits ("don't make collaborator avatars
 * interactive").
 *
 * The current user's own avatar is never rendered from presence data —
 * `UserButton` is the only element representing them, reusing the exact
 * import `editor-navbar.tsx` already uses (spec 19's acceptance criterion
 * 6). `useOthers()` is narrowed to just `{ id, info }` with the `shallow`
 * comparator (per this repo's bundled Liveblocks skill guidance on
 * performant presence) so this component doesn't re-render on every other
 * participant's cursor move — only on join/leave/info changes.
 */
export function PresenceAvatars() {
  const currentUserId = useCurrentUserId()
  const others = useOthers<PresenceCollaborator[]>(
    (list) => list.map((other) => ({ id: other.id, info: other.info })),
    shallow,
  )

  // Excludes the current user's own presence entry, including a second
  // connection from the same account (multi-tab) — `useOthers()` only
  // already excludes the current *connection*, not a same-ID second one.
  // See spec 19's Analyst Brief, Concrete deliverables, and
  // `hooks/use-current-user-id.ts`.
  const collaborators = others.filter((other) => other.id !== currentUserId)
  const visibleCollaborators = collaborators.slice(0, MAX_VISIBLE_COLLABORATORS)
  const overflowCount = collaborators.length - visibleCollaborators.length

  return (
    <div className="pointer-events-none absolute top-4 right-4 z-10 flex items-center gap-3">
      {collaborators.length > 0 && (
        <div aria-hidden className="pointer-events-auto flex items-center -space-x-2">
          {visibleCollaborators.map((collaborator) => (
            <Avatar
              key={collaborator.id}
              title={collaborator.info.name}
              className={`${AVATAR_SIZE_CLASS} ring-2 ring-border-subtle`}
            >
              <AvatarImage src={collaborator.info.avatar} alt="" />
              <AvatarFallback>{getInitials(collaborator.info.name)}</AvatarFallback>
            </Avatar>
          ))}
          {overflowCount > 0 && (
            <div
              className={`${AVATAR_SIZE_CLASS} flex items-center justify-center rounded-full border border-surface-border bg-elevated text-xs font-medium text-copy-secondary ring-2 ring-border-subtle`}
            >
              +{overflowCount}
            </div>
          )}
        </div>
      )}
      {collaborators.length > 0 && <div aria-hidden className="h-6 w-px bg-surface-border" />}
      <div className="pointer-events-auto">
        <UserButton appearance={{ elements: { userButtonAvatarBox: AVATAR_SIZE_CLASS } }} />
      </div>
    </div>
  )
}
