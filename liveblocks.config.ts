import type { LiveList } from "@liveblocks/client"
import type { AiChatMessage, NodeComment } from "@/types/tasks"

/**
 * Realtime collaboration types for the shared Liveblocks room. Field shapes
 * are pinned in `context/architecture-context.md`'s "Realtime Conventions"
 * section specifically so later specs (19 presence UI, 24 AI presence state,
 * 25 sidebar chat feed) don't each make a different call — do not rename or
 * restructure these without updating that doc first.
 *
 * This file only defines the room's `Presence`/`UserMeta`/`Storage` shapes
 * and wires them into Liveblocks' global type augmentation. It intentionally
 * does not create a `RoomProvider`, hooks, or any client-side room wiring —
 * that is spec 11's (base canvas) scope, not this one's (spec 10,
 * infrastructure only).
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

/**
 * The room's Storage tree. `messages` is the `ai-chat` mechanism (spec 25) —
 * an ordered, persisted `LiveList`, not `broadcastEvent` (that has no
 * replay/history for a participant joining mid-conversation), per
 * `architecture-context.md`'s Realtime Conventions. Entries are validated
 * against `types/tasks.ts#AiChatMessageSchema` before being trusted anywhere
 * in the UI — this type only pins the Storage shape, not runtime validation.
 * No `Storage` type existed before this spec (confirmed by reading this file
 * directly — `useLiveblocksFlow` manages canvas nodes/edges without needing
 * a declared root shape), added here for consistency with the `Presence`/
 * `UserMeta` convention above. See spec 25's Analyst Brief, Open Questions
 * #2.
 *
 * `nodeComments` is spec 37's own additive field — one flat, persisted
 * `LiveList` shared by every node in the room (each entry carries its own
 * `nodeId`), the same `LiveList`-per-feed shape as `messages` above rather
 * than a `LiveMap`-per-node structure. Entries are validated against
 * `types/tasks.ts#NodeCommentSchema` before being trusted anywhere in the
 * UI, same convention as `messages`. See spec 37's Analyst Brief, Concrete
 * deliverables.
 */
export type Storage = {
  messages: LiveList<AiChatMessage>;
  nodeComments: LiveList<NodeComment>;
};

declare global {
  interface Liveblocks {
    Presence: Presence;
    UserMeta: UserMeta;
    Storage: Storage;
  }
}
