Add async, node-scoped comment threads, distinct from live cursors/presence (spec 19) and the room-wide `ai-chat` feed (spec 25).

### Implementation

1. Feed

Add a `nodeComments: LiveList<NodeComment>` field to the room's `Storage` type in `liveblocks.config.ts`, alongside the existing `messages` field — same flat-`LiveList` shape as `ai-chat`, not a new `LiveMap`-per-node structure. Each entry carries its own `nodeId`, so one list serves every node in the room.

Define `NodeCommentSchema` (Zod) in `types/tasks.ts`: `{ id, nodeId, sender, content, timestamp }` — same field shape as `AiChatMessageSchema` plus `nodeId`, kept as a fully separate schema/type (no shared base type with `AiChatMessage`, matching this codebase's existing convention of independent per-feed types).

2. Hook

Create `hooks/use-node-comments.ts`, mirroring `hooks/use-ai-chat-feed.ts`'s exact shape: reads/validates the `nodeComments` `LiveList` via `useStorage`, drops invalid entries, and exposes `sendComment(nodeId: string, content: string)` built the same way `sendMessage` is (`useMutation` pushing onto the `LiveList`, `sender` resolved from `useSelf`).

3. UI

Modify `components/editor/canvas-node.tsx`: show a small comment-count badge on a node when it has one or more comments (filter the full comment list by `nodeId`, same client-side filtering `use-node-comments.ts` can expose per node or per full list — implementer's choice). Clicking the badge opens a popover/panel showing that node's comment thread in order (reuse `ChatBubble`'s sender/timestamp/content layout convention from `ai-architect-tab.tsx`) plus a small reply input calling `sendComment`.

4. Wiring

Add `initialStorage`'s `nodeComments: new LiveList([])` to the `RoomProvider` in `components/editor/canvas.tsx`, matching how `messages` was added for spec 25.

### Scope Limits

- Do not add comment threading/replies-to-replies — a flat, chronological list per node only.
- Do not add @mentions or any notification mechanism — that's a separate concern (see the "notify on completion" idea, out of scope here).
- Do not add comments on edges — nodes only.
- Do not modify `ai-chat` or `ai-status-feed` in any way.
- Do not change node drag/select/edit behavior beyond adding the badge/popover trigger.

### Notes

- Follow spec 25's `ai-chat` implementation (`hooks/use-ai-chat-feed.ts`, `liveblocks.config.ts`) as the direct precedent for this feed's shape and persistence guarantee (must replay to a participant who joins mid-session — Storage `LiveList`, not `broadcastEvent`).

### Check When Done

- A node with at least one comment shows a visible indicator.
- Clicking it opens a thread scoped to that specific node only.
- New comments persist in Liveblocks Storage and replay correctly to a participant who joins the room afterward.
- Comments on different nodes never mix in the same thread view.
- `npm run build` passes.
