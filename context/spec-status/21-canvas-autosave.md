# Spec 21: Canvas Autosave

Source spec: `context/feature-specs/21-canvas-autosave.md`

## Analyst Brief

### Scope statement

Persist the collaborative canvas graph (nodes/edges) to Vercel Blob with the blob reference stored on the Prisma `Project` record, add a debounced autosave hook that writes the current canvas state, load a previously-saved canvas into an empty room on editor open, and surface a saving/saved/error status in the editor UI. Nothing about AI generation, spec generation, or any other feature is in scope.

### Concrete deliverables

- `package.json` — add `@vercel/blob`.
- `prisma/schema.prisma` — **no schema change needed.** `Project.canvasJsonPath String?` already exists (added ahead of schedule in spec 06 — see `progress-tracker.md`'s spec 06 entry: "this was spec 05's originally-planned schema, never actually shipped until now"). This spec reuses that field; it does not add a new column or model.
- `lib/canvas-blob.ts` (new) — shared upload/fetch helpers wrapping `@vercel/blob`, storing/reading canvas JSON at `canvas/{projectId}.json` (per `architecture-context.md`'s Storage Model, which already documents this exact path convention). Should follow the same lazy-instantiation pattern `lib/liveblocks.ts` (spec 10) used for `LIVEBLOCKS_SECRET_KEY`, so a missing Blob token doesn't break `next build`'s page-data collection.
- `app/api/projects/[projectId]/canvas/route.ts` (new) — `PUT` (accept canvas JSON, upload to Blob, update `Project.canvasJsonPath`) and `GET` (read `canvasJsonPath` from Prisma, fetch the JSON from Blob server-side, return it in the response body — never the raw blob URL, see Open Questions #6). Both enforce auth before any Prisma/Blob call, same precedence convention (401/404/403) as the existing `app/api/projects/[projectId]/route.ts`.
- `lib/project-access.ts` and/or `lib/projects.ts` — likely needs a small addition or reuse: this route's auth gate must be owner-or-collaborator, not the owner-only `getOwnedProjectOrError` used by `PATCH`/`DELETE /api/projects/[projectId]`. See Open Questions #4.
- `hooks/use-canvas-autosave.ts` (new, in the top-level `hooks/` folder per `architecture-context.md`'s Hooks Convention) — watches the Liveblocks-synced `nodes`/`edges`, debounces writes to the `PUT` route, and exposes a `saving | saved | error` status.
- `components/editor/canvas.tsx` (modified) — `CanvasFlow` wires the autosave hook to its existing `nodes`/`edges` (from `useLiveblocksFlow`), and on mount checks whether the room already has any nodes/edges: if not, and the project has a saved `canvasJsonPath`, fetches and loads the saved snapshot into the room; if the room already has content, skips the load entirely. Needs to expose save status upward for the navbar indicator (see Open Questions #1).
- `components/editor/workspace-navbar.tsx` and/or a new small component (e.g. `components/editor/save-status-indicator.tsx`) — surfaces the saving/saved/error status. **No "Save" button currently exists anywhere in this codebase** (confirmed via grep across `components/`) — see Open Questions #1 for how this deliverable should actually land.
- `components/editor/workspace-shell.tsx` (modified) — threads save status from `Canvas` up to `WorkspaceNavbar`, same "parent owns state, pass down as props" convention already used for `isTemplatesModalOpen` (spec 18).
- Tests: `lib/canvas-blob.test.ts`, `app/api/projects/[projectId]/canvas/route.test.ts`, `hooks/use-canvas-autosave.test.ts` (all new), extended `components/editor/canvas.test.tsx`, `workspace-navbar.test.tsx`, `workspace-shell.test.tsx`.

### Acceptance criteria

1. `@vercel/blob` is installed and is the only mechanism used to store/read canvas JSON content.
2. `Project.canvasJsonPath` (the existing schema field, not a new one) is the sole place the blob reference is persisted in Postgres; the canvas JSON body itself is never written to Postgres.
3. `PUT /api/projects/[projectId]/canvas` accepts the current canvas JSON from an authenticated owner or collaborator, uploads it to Vercel Blob at `canvas/{projectId}.json`, and updates `canvasJsonPath` on the matching `Project` row. Returns 401 unauthenticated, 404 missing project, 403 authenticated non-member.
4. `GET /api/projects/[projectId]/canvas` (same auth gate as #3) reads `canvasJsonPath` from Prisma, fetches the canvas JSON from Vercel Blob server-side, and returns the JSON content itself in the response body — not the raw blob URL.
5. A project with no saved canvas yet (`canvasJsonPath` is null) returns a defined, non-throwing response from `GET` (exact shape is an open question — see Open Questions #3).
6. `hooks/use-canvas-autosave.ts` watches the room's nodes/edges and debounces writes to the `PUT` route rather than saving on every single change.
7. The autosave hook exposes a `saving | saved | error` status that the editor UI reflects.
8. On editor load, if the Liveblocks room already has any existing nodes or edges, no load-from-Blob call happens — skipped entirely, regardless of whether a saved blob also exists, to avoid overwriting active collaboration.
9. On editor load, if the room is empty and the project has a saved `canvasJsonPath`, the saved canvas JSON is fetched and applied into the room so returning collaborators see prior work.
10. On editor load, if the room is empty and the project has no saved canvas, nothing loads — canvas starts empty (unchanged from the spec-11 baseline).
11. A save-status indicator (saving/saved/error) is visible in the editor's workspace UI (placement detail is an open question — see Open Questions #1).
12. `npm run build` passes, along with this repo's other standard gates (`npx tsc --noEmit`, `npx eslint .`, `npx vitest run`) per `code-standards.md`'s Testing section.

### Dependencies

- Spec 05 (Prisma Postgres) + spec 06 (Project APIs) — `Project.canvasJsonPath` already exists in `prisma/schema.prisma`. **Complete.**
- Spec 10 (Liveblocks Setup) + spec 11 (Base Canvas) — the room/`useLiveblocksFlow` mechanism this hook watches and loads into. **Complete.**
- Spec 08 (Editor Workspace Shell) + spec 09 (Share Dialog) — the owner/collaborator identity and access-check model this route's auth gate needs to reuse (`lib/project-access.ts`, `lib/collaborators.ts`). **Complete.**
- A real Vercel Blob read/write token needs to be provisioned in the environment (parallel to spec 10's `LIVEBLOCKS_SECRET_KEY` gap, per `progress-tracker.md`) — not yet confirmed present. `next build` should still pass without it if `lib/canvas-blob.ts` follows the same lazy-instantiation pattern `lib/liveblocks.ts` established.

### Open questions

1. **No "Save" button exists anywhere in this codebase today** (confirmed via grep of `components/`), but the spec's step 5 says "Add a small save status indicator **in the editor Save button**," which presumes one already exists. Recommendation: since this spec's own text describes only automatic, debounced saving with no manual "Save Now" trigger requested anywhere (and `project-overview.md` never mentions a manual save action), add a small non-interactive status element (icon + "Saving…" / "Saved" / "Save failed" text) to `WorkspaceNavbar`, in the slot a manual Save button might otherwise occupy — not a new clickable action. Flagging this for Senior Developer/QA confirmation before build, since it's a genuine gap in the spec text, not a decision made unilaterally here.
2. **Debounce interval** isn't specified anywhere in the spec text. Recommendation: a short fixed interval (in the 1–2 second range) after the last node/edge change, as a Dev-level choice — same "reasonable unpinned value" precedent as `ZOOM_TRANSITION_DURATION_MS` (spec 17) and `NODE_MIN_SIZE` (spec 14).
3. **Response shape for "no saved canvas yet"** on `GET` isn't specified. Recommendation: `404` via this repo's existing `errorResponse` envelope (`lib/api-response.ts`), treated by the load logic as "nothing to load" rather than a user-facing error.
4. **Auth model for the new canvas route** isn't stated in the spec text (owner-only vs. owner-or-collaborator). Recommendation: owner-or-collaborator, per `architecture-context.md`'s Auth and Collaboration Model ("Only the owner or a collaborator can mutate project resources") — collaborators actively edit the shared canvas per `project-overview.md`'s Core User Flow step 7, so their autosave writes must not be blocked by an owner-only gate. This differs from `PATCH`/`DELETE /api/projects/[projectId]`'s owner-only gate. `lib/project-access.ts#getProjectAccess`'s existing owner-or-collaborator logic is the right shape to reuse, though its docstring currently scopes it to view-access only for `/editor/[roomId]` — Senior Developer should decide whether to relax that docstring/reuse it directly for this mutation, or extract a small shared helper instead.
5. **Whether the load-into-room step needs to be a single atomic/batched Storage write** isn't stated. Recommendation: yes — apply the same `room.batch(...)` convention spec 18 established for template import, since a remote collaborator could otherwise observe a transient empty→partial frame while the saved snapshot's nodes/edges are added one type at a time.
6. **Vercel Blob store visibility (public vs. private)** is already logged as a cross-cutting open item in `progress-tracker.md`'s "Deferred — Production Hardening" section, which explicitly names this spec's download-route as relevant but not fully sufficient on its own. Not this spec's job to resolve, but the `GET` route returning the fetched JSON body itself (never the raw blob URL, per acceptance criterion 4) avoids making that gap worse — carried forward as context, not a new requirement invented here.

### Out-of-scope callouts

- **AI-generated canvas content, `/api/ai/*`, Trigger.dev** — explicitly future specs (22+), even though the spec's own first sentence mentions "before adding AI generation." This spec only persists/loads whatever nodes/edges already exist in the room.
- **Versioned/historical canvas snapshots or save history** — `project-overview.md`'s Out of Scope wall explicitly excludes "versioned spec history and review workflows." This spec keeps exactly one snapshot per project (`canvasJsonPath` overwritten on every save), never a history.
- **Production object storage migration** — Out of Scope wall item. Vercel Blob is the storage target as specified; no migration work.
- **A manual "Save Now" user action** — not requested anywhere in the spec text; autosave (debounced, automatic) is the only save trigger described.
- **Collaborator permission tiers beyond owner/collaborator** — Out of Scope wall item; the new canvas route's auth gate reuses the existing binary owner-or-collaborator model, nothing new.
- **Any change to the AI Sidebar (spec 20)** — untouched by this spec.

Brief ready for Senior Developer at `context/spec-status/21-canvas-autosave.md`.

## Dev Notes

### Files added

- `lib/canvas-blob.ts` — shared `@vercel/blob` upload/fetch helpers (`uploadCanvasSnapshot`/`fetchCanvasSnapshot`, `canvasBlobPathname`). Follows the same lazy-token-check pattern `lib/liveblocks.ts#getLiveblocksClient` established for `LIVEBLOCKS_SECRET_KEY` — `requireBlobToken()` throws a clear error only when actually called, not at import time, so a missing `BLOB_READ_WRITE_TOKEN` doesn't break `next build`'s page-data collection (confirmed: build passes in this environment, which has no `BLOB_READ_WRITE_TOKEN` set).
- `app/api/projects/[projectId]/canvas/route.ts` — `PUT` (owner-or-collaborator, uploads to Blob, updates `Project.canvasJsonPath`) and `GET` (same gate, reads `canvasJsonPath`, fetches from Blob server-side, returns the JSON body — never the raw blob URL). 401/404/403 precedence matches every other project route.
- `hooks/use-canvas-autosave.ts` — `useCanvasAutosave`, debounces (`CANVAS_AUTOSAVE_DEBOUNCE_MS = 1500`) writes to the `PUT` route and exposes `idle | saving | saved | error`. Gated by an `enabled` flag so a save can't fire before the initial load-or-skip decision (below) settles. A `requestId` ref discards stale in-flight responses.
- `components/editor/save-status-indicator.tsx` — small non-interactive status element for the navbar (see Open Questions #1 disposition below).
- Tests: `lib/canvas-blob.test.ts`, `app/api/projects/[projectId]/canvas/route.test.ts`, `hooks/use-canvas-autosave.test.ts`, `components/editor/save-status-indicator.test.tsx` (all new).

### Files modified

- `components/editor/canvas.tsx` — `CanvasFlow` gains: (1) a mount-guarded effect (`hasAttemptedInitialLoadRef`) that checks whether the room already has any nodes/edges; if not, fetches `GET /api/projects/[projectId]/canvas` and applies a valid snapshot via one `room.batch(...)` wrapping both `onNodesChange`/`onEdgesChange` "add" calls (same atomic-write convention spec 18 established for template import) — skipped entirely if the room already has content; (2) `useCanvasAutosave`, gated by `isReadyForAutosave` (flipped true once the load-or-skip decision settles), with its returned status pushed up via a new `onSaveStatusChange` prop. A local `isCanvasSnapshotBody` type guard does the shallow validation.
- `components/editor/workspace-shell.tsx` — owns `saveStatus` state (`useState<CanvasSaveStatus>("idle")`), passes `setSaveStatus` to `Canvas` as `onSaveStatusChange`, and `saveStatus` to `WorkspaceNavbar`.
- `components/editor/workspace-navbar.tsx` — new `saveStatus` prop, renders `<SaveStatusIndicator>` as the leading element in the button row.
- `context/ui-context.md` — new "Save Status Indicator" section under Canvas.
- `package.json`/`package-lock.json` — added `@vercel/blob`.
- Tests extended: `components/editor/canvas.test.tsx` (new "canvas autosave (spec 21)" describe block; global `fetch` stubbed in `beforeEach`/`afterEach` so the many pre-existing tests, which now trigger the mount-time load-check effect, don't hit real network; `@/hooks/use-canvas-autosave` mocked so this file verifies wiring, not the hook's own internals), `workspace-navbar.test.tsx`, `workspace-shell.test.tsx` (Canvas mock extended with an `onSaveStatusChange` callback, exercised via a stand-in button).

### Skills used

- None from `.claude/skills/` applied directly — no Clerk/Prisma-query/Liveblocks-specific work in this pass beyond patterns already established in prior specs (`getProjectAccess`, `useRoom().batch`, `useLiveblocksFlow`'s `onNodesChange`/`onEdgesChange`), all reused as-is rather than re-derived from a skill.

### Key decisions (brief's Open Questions)

1. **No manual Save button** — added a non-interactive `SaveStatusIndicator` (icon + "Saving…"/"Saved"/"Save failed") in `WorkspaceNavbar`'s button row, per the brief's own recommendation. Renders nothing for `"idle"`.
2. **Debounce interval** — `CANVAS_AUTOSAVE_DEBOUNCE_MS = 1500` (1.5s), within the brief's recommended 1–2s range.
3. **`GET` "no saved canvas" response shape** — `404` via the existing `errorResponse` envelope, for both "canvasJsonPath is null" and "the referenced blob is missing/corrupt." The editor's load effect treats any non-OK response identically as "nothing to load."
4. **Auth model** — owner-or-collaborator via `lib/project-access.ts#getProjectAccess`, reused directly (not extracted into a new helper) — its existing 401/404/403 shape already matched what this route needed; only its docstring's "view-access only" scoping is now slightly stale for this one route (not otherwise altered).
5. **Atomic batched load** — yes, `room.batch(...)` wraps both `onNodesChange`/`onEdgesChange` "add" calls when applying a loaded snapshot.
6. **Blob store visibility** — used `access: "public"` (the practical default); this remains a cross-cutting deferred item per `progress-tracker.md`. The `GET` route never returns the raw blob URL to the client, consistent with that entry's stated mitigation.

### Additional implementation notes

- `Canvas`'s `onSaveStatusChange` callback-prop push-up (rather than spec 18's "parent owns state, child reads it directly" `isTemplatesModalOpen` pattern) is a deliberate, documented deviation: `useCanvasAutosave` needs the room's live `nodes`/`edges`, so it can only run inside `CanvasFlow`, beneath the Liveblocks `RoomProvider`/`ClientSideSuspense` boundary `WorkspaceShell` sits outside of. Flagged in both `canvas.tsx`'s and `workspace-shell.tsx`'s docblocks for QA/PO visibility, not silently introduced.
- The initial-load effect's dependency array includes `nodes`/`edges` (for `exhaustive-deps` correctness) even though the actual one-time logic is guarded by a ref — later `nodes`/`edges` changes just cause the effect to re-fire and immediately return.

### Test coverage

- `lib/canvas-blob.test.ts` — pathname helper; token-missing errors for both upload/fetch; upload call shape (overwrite/no-random-suffix/public/contentType); fetch: null-on-not-found, null-on-non-200, null-on-invalid-JSON, null-on-shape-mismatch, valid-snapshot parse, and a genuine upstream error (rejected `get()`) propagating rather than being swallowed as "no canvas."
- `app/api/projects/[projectId]/canvas/route.test.ts` — `PUT`: 401/404/403 precedence, invalid JSON body, non-array nodes/edges, successful upload+Prisma update for a *collaborator* (not just an owner), 500 on Blob failure (Prisma update skipped). `GET`: 401/404/403 precedence, null `canvasJsonPath` → 404, `fetchCanvasSnapshot` returning `null` → 404, successful body passthrough (asserted the raw blob URL never appears in the response), 500 when Blob fetch throws.
- `hooks/use-canvas-autosave.test.ts` — idle-before-debounce, `enabled: false` never schedules, successful PUT → `saved`, non-OK response → `error`, rejected fetch → `error`, timer reset on every nodes/edges change (only the last change is saved), a stale in-flight response can't overwrite a later "saved" status, and cleanup cancels a pending save on unmount. Uses `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync` wrapped in `act(...)`.
- `components/editor/canvas.test.tsx` (new describe block) — skip-when-room-has-nodes, skip-when-room-has-edges, load-nothing-on-non-OK-GET, load-a-saved-snapshot-via-one-batch (including mutation-order-after-batch assertion), malformed-body-treated-as-nothing-to-load, `useCanvasAutosave` wired with the right `projectId`/`nodes`/`edges`, and the hook's status reaching `onSaveStatusChange`.
- `components/editor/save-status-indicator.test.tsx` — idle renders nothing; each of saving/saved/error renders its expected label.
- `workspace-navbar.test.tsx`/`workspace-shell.test.tsx` — extended for the new `saveStatus`/`onSaveStatusChange` prop plumbing.
- Commands run: `npx tsc --noEmit` (pass), `npx eslint .` (pass, 0 errors), `npx vitest run --no-file-parallelism` (362/362 passing across 45 files, up from 316/41 at the end of spec 20 — `--no-file-parallelism` used per this repo's documented environment-driven worker-timeout flakiness under default parallelism, not a spec-21-specific issue), `npx next build` (pass, confirmed the new `/api/projects/[projectId]/canvas` route builds successfully with no `BLOB_READ_WRITE_TOKEN` set in this environment).

### Known limitations / deliberate deferrals

- No live network verification against a real Vercel Blob store — `BLOB_READ_WRITE_TOKEN` is not provisioned in this environment (same gap the brief's Dependencies section flags). All Blob interaction is unit-tested against a mocked `@vercel/blob` module.
- No live two-tab/multiplayer verification of the load-skip-on-existing-content behavior or the atomic batched load, consistent with every prior canvas spec (11–20) in this pipeline — recommended as a human smoke test alongside those.
- `lib/project-access.ts#getProjectAccess`'s docstring ("a *view*-access gate for `/editor/[roomId]` only") is now slightly stale, since this spec also reuses it as a *mutation* gate for `PUT /api/projects/[projectId]/canvas`. Not edited, per the brief's Open Questions #4 leaving this as a Dev-level call — flagging for QA/PO rather than silently rewriting the docstring's scope claim.
