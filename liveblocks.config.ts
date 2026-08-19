/**
 * Realtime collaboration types for the shared Liveblocks room. Field shapes
 * are pinned in `context/architecture-context.md`'s "Realtime Conventions"
 * section specifically so later specs (19 presence UI, 24 AI presence state)
 * don't each make a different call — do not rename or restructure these
 * without updating that doc first.
 *
 * This file only defines the room's `Presence`/`UserMeta` shapes and wires
 * them into Liveblocks' global type augmentation. It intentionally does not
 * create a `RoomProvider`, hooks, or any client-side room wiring — that is
 * spec 11's (base canvas) scope, not this one's (spec 10, infrastructure
 * only).
 */

/**
 * Per-connection ephemeral state broadcast to everyone else in the room.
 * Field name is `thinking`, not `isThinking` — resolved ahead of this spec
 * to avoid a later inconsistency across specs 10/19/24.
 */
export type Presence = {
  cursor: { x: number; y: number } | null;
  thinking: boolean;
};

/**
 * Static-per-session identity attached to a connection at auth time (see
 * `app/api/liveblocks-auth/route.ts`). Shape follows Liveblocks' own
 * `{ id, info }` convention — spec 19 (presence avatars/cursors) later reads
 * "profile photos," "initials fallback," and "match the pointer and badge
 * color to the participant's presence color" off of exactly these fields.
 */
export type UserMeta = {
  id: string;
  info: {
    name: string;
    avatar: string;
    color: string;
  };
};

declare global {
  interface Liveblocks {
    Presence: Presence;
    UserMeta: UserMeta;
  }
}
