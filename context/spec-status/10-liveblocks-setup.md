# Spec 10 — Liveblocks Setup

## Analyst Brief

### Scope statement

This spec sets up the realtime collaboration *infrastructure* only: typed `Presence`/`UserMeta` definitions in `liveblocks.config.ts`, a cached Liveblocks Node client plus a deterministic user-ID-to-cursor-color helper in `lib/`, and an authenticated `POST /api/liveblocks-auth` route that verifies project access (via the existing access helper) and issues a Liveblocks room session token. It delivers no UI, no canvas, and no room-consuming component — those belong to later specs.

### Concrete deliverables

- `liveblocks.config.ts` (project root, per the spec's explicit path) — `Presence` type (`cursor: { x: number; y: number } | null`, `thinking: boolean` — this exact shape and field name is already pinned in `architecture-context.md`'s "Realtime Conventions" section specifically so this spec doesn't have to re-decide it) and `UserMeta` type (user ID, display name, avatar URL, cursor color).
- `lib/liveblocks.ts` (or an equivalently single-purpose split, e.g. `lib/liveblocks.ts` + `lib/liveblocks-color.ts`) — a module-level cached `Liveblocks` node client (from `@liveblocks/node`, keyed off a secret key env var), following the same singleton pattern as `lib/prisma.ts`, plus a pure `getCursorColor(userId: string): string` helper that deterministically maps a user ID to one color from a fixed palette.
- `app/api/liveblocks-auth/route.ts` (new) — `POST` handler: Clerk auth check, `getProjectAccess` (from `lib/project-access.ts`) call using the room ID as the project ID, room existence check/creation, session token issuance with user name/avatar/color.
- `package.json` — new `@liveblocks/*` dependencies (see Open Questions — the spec's claim that these are "already installed" does not match the current lockfile).
- Env var addition (`.env` / `.env.local`) for a Liveblocks secret key — currently absent from the repo entirely (see Open Questions).

### Acceptance criteria

1. `liveblocks.config.ts` at the project root defines a `Presence` type with `cursor: { x: number; y: number } | null` and `thinking: boolean`, matching `architecture-context.md`'s Realtime Conventions exactly (field name `thinking`, not `isThinking`).
2. `liveblocks.config.ts` defines a `UserMeta` type carrying user ID, display name, avatar URL, and cursor color.
3. A cached Liveblocks Node client is exported from `lib/` and instantiated once per process (module-level singleton — not re-created per request).
4. A helper function deterministically maps a given user ID to the same color from a fixed palette on every call (pure function, no randomness, no per-call state).
5. `POST /api/liveblocks-auth` requires Clerk authentication and returns `401` when there is no signed-in session.
6. The route resolves the target project/room ID from the request body and calls `getProjectAccess` (`lib/project-access.ts`) to confirm the caller is the project's owner or a collaborator.
7. The route returns `403` when the caller is authenticated but is neither the owner nor a collaborator on that project.
8. If the Liveblocks room for that project ID does not already exist, the route creates it; if it already exists, the route does not attempt to recreate it (idempotent "create only if needed" behavior).
9. On success, the route returns a Liveblocks session token whose attached user info includes the caller's display name, avatar URL, and a cursor color produced by the deterministic color helper.
10. No `RoomProvider`, `LiveblocksProvider`, canvas, or presence UI is added in this spec.
11. `npm run build` passes.

### Dependencies

- `lib/project-access.ts#getProjectAccess` (delivered in spec 08, extended with `isOwner` in spec 09) — **complete** per `progress-tracker.md`. This spec reuses it as-is; no changes to that file are expected.
- Clerk authentication (spec 03) — **complete**, already wired via `@clerk/nextjs/server`.
- Project metadata in PostgreSQL (spec 05/06) — **complete**. The project ID used as the Liveblocks room ID already exists as a first-class `Project.id`.
- No Prisma schema changes are needed — Liveblocks rooms and sessions are managed externally by the Liveblocks service, not tracked as new relational data.

### Open questions

1. **Liveblocks packages are not actually installed.** The spec's "Dependencies" section states "All required Liveblocks packages are already installed," but `package.json` currently has no `@liveblocks/*` entries at all. Recommendation: the Senior Developer should install `@liveblocks/node` (required for the auth route) and `@liveblocks/client` (required to type `liveblocks.config.ts`'s `Presence`/`UserMeta` against Liveblocks' own types) as part of this spec's work, since the spec's premise that they're pre-installed doesn't hold. This is a correction to the spec text, not a scope expansion — the packages are a hard prerequisite for the deliverables the spec itself asks for.
2. **No Liveblocks secret key exists anywhere in the repo.** A repo-wide search found no `LIVEBLOCKS_*` variable in `.env` or `.env.local`. This mirrors the kind of human-action gap already logged in `progress-tracker.md` for spec 09 (branch/PR creation) — the auth route's logic can be written and type-checked without a live key, but it cannot be end-to-end verified (an actual session token issued and accepted by Liveblocks) until a real Liveblocks project + secret key is provisioned and added to the environment. Recommendation: flag this to the human up front rather than have QA discover it as a blocked manual-verification step later.
3. **No fixed cursor-color palette is defined anywhere in the context docs.** `ui-context.md` defines `NODE_COLORS` for canvas nodes and semantic UI tokens, but neither is described as reusable for presence cursors, and no separate palette is specified for this purpose. Recommendation: the Senior Developer picks a small fixed array of visually distinct hex values as a local constant for the color-mapping helper. This is a visual/technical implementation detail, not a product decision, so it should not block the spec — but it's called out here since it isn't sourced from any existing token file, in case a future spec (e.g. 19) expects these colors to be themed consistently with the rest of the UI.
4. **Error-status precedence isn't fully spelled out.** The spec only states "Return `403` for unauthorized project access" and doesn't separately address the unauthenticated or room/project-not-found cases. Recommendation: follow the same `401` (unauthenticated) → `404`/`403` (via `getProjectAccess`'s own `not-found`/`forbidden` discriminants) precedence already established by every other route in this codebase (e.g. `app/api/projects/[projectId]/collaborators/route.ts`), rather than collapsing all failure cases to `403`, for consistency with `code-standards.md`'s "consistent, predictable response shapes" rule. Flagged as a recommendation, not a spec-stated requirement — the Senior Developer or QA should confirm this reading is reasonable rather than treat it as settled.
5. **`UserMeta`'s exact field nesting isn't specified.** The spec lists "user ID, display name, avatar URL, cursor color" but not the object shape. Recommendation: use Liveblocks' own conventional shape, `{ id: string; info: { name: string; avatar: string; color: string } }`, since spec 19 (presence avatars/cursors, not in scope here) later reads "profile photos," "initials fallback," and "match the pointer and badge color to the participant's presence color" off of exactly these fields — confirming this shape is the one later specs expect to consume, without this spec needing to build any of that consuming UI itself.

### Out-of-scope callouts

- **No `RoomProvider`/`LiveblocksProvider`/`ClientSideSuspense` wiring into the editor.** Spec 11 (base canvas) owns creating the client-side canvas wrapper that actually opens a Liveblocks room using this spec's auth route.
- **No React Flow canvas or `types/canvas.ts`.** Also spec 11.
- **No presence avatar UI, live cursor rendering, or `thinking`-state UI.** Spec 19 (presence avatars/cursors) and spec 24 (AI presence state) consume the `Presence`/`UserMeta` types defined here, but rendering them is explicitly their scope, not this one's.
- **No `ai-status-feed` `broadcastEvent` or `ai-chat` `LiveList` implementation.** These mechanisms are already conceptually pinned down in `architecture-context.md`'s Realtime Conventions ahead of specs 22/24/25, but this spec only sets up `Presence`/`UserMeta`/room auth — not those event/storage channels.
- **No canvas snapshot persistence to Vercel Blob.** That's spec 21 (canvas autosave); this spec doesn't touch storage of canvas content at all.
- **No changes to `lib/project-access.ts` itself.** This spec consumes `getProjectAccess` as-is; it already returns `isOwner` from spec 09, which isn't needed here but doesn't need to be removed.
- **No billing, permission tiers beyond owner/collaborator, or anything else on `project-overview.md`'s Out of Scope list.** Nothing in this spec's text touches those areas, but noting it explicitly per the standing rule.

## Dev Notes

### Files added

- `liveblocks.config.ts` (project root) — `Presence` (`cursor: { x, y } | null`, `thinking: boolean`) and `UserMeta` (`{ id: string; info: { name, avatar, color } }`) types, plus `declare global { interface Liveblocks { Presence; UserMeta } }` — the standard Liveblocks type-augmentation pattern (confirmed against `@liveblocks/core`'s own doc comment for `LiveText`, which documents the same `declare global` shape). Because `tsconfig.json` includes `**/*.ts` at the project root by default, this augmentation applies program-wide without any file needing to import `liveblocks.config.ts` directly — it's what lets `app/api/liveblocks-auth/route.ts`'s `liveblocks.prepareSession(userId, { userInfo })` be typed against our `UserMeta["info"]` shape instead of the SDK's generic default.
- `lib/liveblocks.ts` — `getLiveblocksClient()`: a cached, lazily-instantiated `@liveblocks/node` `Liveblocks` client, keyed off `LIVEBLOCKS_SECRET_KEY`, cached on `globalThis` the same way `lib/prisma.ts` caches its client. Deliberately deferred (function, not a top-level `export const`) — see "Key decisions" below.
- `lib/liveblocks-color.ts` — `getCursorColor(userId: string): string`, a pure string-hash → fixed 8-color-palette mapping. No dependency on any other module.
- `app/api/liveblocks-auth/route.ts` — `POST` handler. Reads `{ room: string }` from the JSON body (matches `@liveblocks/client`'s default `authEndpoint` callback, which posts `JSON.stringify({ room })` — confirmed against `node_modules/@liveblocks/core`'s type comments), then: 400 on malformed body/missing `room` → `getProjectAccess(room)` for the 401/404/403 precedence → re-fetches the caller's Clerk profile via `currentUser()` for display name/avatar (401 defensively if that somehow comes back null after the access check passed) → `getLiveblocksClient()` (500 if unconfigured) → `liveblocks.getOrCreateRoom(room, { defaultAccesses: [] })` (idempotent create-only-if-needed) → `prepareSession(...).allow(room, ["room:write"]).authorize()`, returning the SDK's own `{ status, body }` directly as the response (502 if any Liveblocks API call in this block throws).
- `lib/liveblocks.test.ts`, `lib/liveblocks-color.test.ts`, `app/api/liveblocks-auth/route.test.ts` — unit tests (see Test coverage below).

### Files changed

- `package.json` / `package-lock.json` — added `@liveblocks/node` and `@liveblocks/client` (`^3.24.0`). The brief's Open Questions #1 correctly flagged these as missing despite the spec text claiming they were pre-installed; installed with `--legacy-peer-deps` (same reason as the existing Vitest/RTL install: a Babel 7/8 peer conflict between `@vitejs/plugin-react` and `shadcn`'s dependency chain, unrelated to Liveblocks itself).
- `.env.local` — added an empty `LIVEBLOCKS_SECRET_KEY=` placeholder with an explanatory comment. Left empty rather than filled in: no live Liveblocks project/secret exists anywhere in this environment (brief's Open Questions #2). `.env.local` is `.gitignore`d (`.env*`), so this doesn't leak anything and doesn't need redaction before commit.
- `context/progress-tracker.md` — added spec 10 under "In Progress"; corrected a stale "Next Up" entry that still described specs 07–09 as unmerged/uncommitted (they're on `main` via PR #1/#2 per `git log`, and spec 09 is already listed under "Completed" a few lines above it — that entry was simply never updated after the merge).

### Key decisions

1. **Lazy client instantiation instead of eager top-level export.** `lib/prisma.ts`'s pattern is `export const prisma = ... ?? createClient()` evaluated at module load. I did not copy that literally for Liveblocks: `next build` runs a "Collecting page data" step that imports every route module server-side, which would execute a top-level `createLiveblocksClient()` call and — with no `LIVEBLOCKS_SECRET_KEY` set in this environment — throw and fail the build. `getLiveblocksClient()` is a function instead: same `globalThis`-cached singleton, same "instantiated once per process" guarantee (acceptance criterion 3), but creation (and the throw if the secret is missing) only happens when a request actually reaches the route and calls it. Verified this holds: `next build` passes with `LIVEBLOCKS_SECRET_KEY` unset (see Test coverage).
2. **`UserMeta` shape**: used the brief's Open Questions #5 recommendation verbatim — `{ id: string; info: { name: string; avatar: string; color: string } }` — since it's the shape `@liveblocks/node`'s own `BaseUserMeta`/`IUserInfo` types expect for `prepareSession`'s `userInfo` option, and it's what spec 19 is documented to expect downstream.
3. **Cursor-color palette**: 8 hex values (brief's Open Questions #3 — no existing token file covers this). Reused `ui-context.md`'s existing "Node Color Palette" *text* colors (the readable/vivid half of each pair, e.g. `#52A8FF`, `#BF7AF0`, `#FF990A`) rather than inventing an unrelated set, on the theory that if spec 19 later wants presence colors to feel visually consistent with the rest of the UI, starting from colors already proven legible on the dark canvas background is a safer default than picking something new. Flagged, not treated as settled, per the brief's caveat.
4. **Error-status precedence**: followed Open Questions #4's recommendation — 401 unauthenticated → 400 malformed body → 404 not-found → 403 forbidden → 500 (Liveblocks misconfigured, i.e. no secret) → 502 (Liveblocks API call itself failed). The spec text only says "403 for unauthorized access"; this treats that as "403 specifically for authenticated-but-not-a-member," consistent with every other route in the codebase.
5. **Room access scope**: `session.allow(roomId, ["room:write"])`, granting both read and write on that single room to any owner or collaborator (view-access and edit-access aren't distinguished for the canvas room itself — same non-distinction `getProjectAccess`'s `isOwner` already documents as "not itself a security boundary" for UI purposes). Read-only viewer roles aren't part of this spec's or `project-overview.md`'s scope.
6. **Room defaults**: `getOrCreateRoom(roomId, { defaultAccesses: [] })` — no public/default room access; every connection must come through this auth route's session token. This is what makes the `getProjectAccess` check actually load-bearing rather than advisory.

### Test coverage

- `lib/liveblocks.test.ts` (4 tests): throws a handled (non-crashing-at-import) error when `LIVEBLOCKS_SECRET_KEY` is unset; confirms the module itself can be imported without throwing even when unset (directly protects the `next build` concern in decision #1); confirms singleton reuse within one import and across a simulated re-import via `globalThis`.
- `lib/liveblocks-color.test.ts` (5 tests): determinism (same ID → same color across repeated calls), output is one of the fixed hex values, different IDs aren't collapsed to a single color, and no exceptions on edge-case input (empty string, unicode/long strings).
- `app/api/liveblocks-auth/route.test.ts` (12 tests): 400 for invalid JSON / missing `room` / non-string `room`; 401/404/403 via each `getProjectAccess` discriminant; 401 on the defensive null-`currentUser()` race; 500 when `getLiveblocksClient` throws; 502 when the Liveblocks API call throws; success path asserts `getOrCreateRoom` is called with `{ defaultAccesses: [] }`, `getCursorColor` is called with the caller's Clerk ID, `prepareSession` receives the right `userInfo`, `session.allow` is scoped to `["room:write"]` on the correct room, and the route's response body/status pass through the SDK's own `authorize()` result untouched; a separate test confirms `getOrCreateRoom` is called exactly once per request (the idempotency guarantee is delegated to Liveblocks' own API, not re-implemented as a separate existence probe).
- Commands run: `npx tsc --noEmit` (pass), `npx eslint .` (pass — one pre-existing unrelated warning in `.agents/skills/.../__root.tsx`, not touched by this spec), `npx vitest run` (131/131 passing across 19 files, up from 110/16 before this spec), `npx next build` (pass, including with `LIVEBLOCKS_SECRET_KEY` unset).

### Known limitations / deferrals

- ~~**No live end-to-end verification against the real Liveblocks service.**~~ **Resolved 2026-08-19.** A real `LIVEBLOCKS_SECRET_KEY` was provisioned into `.env.local`. Ran a direct smoke check against the live Liveblocks API (bypassing the HTTP route, since that requires a real Clerk session): `getLiveblocksClient`-equivalent `new Liveblocks({ secret })` → `getOrCreateRoom(roomId, { defaultAccesses: [] })` created a real room → `prepareSession(...).allow(roomId, ["room:write"]).authorize()` returned `200` with a session token body → `deleteRoom(roomId)` cleaned it up. Confirms the SDK usage patterns validated against type definitions during the QA round also work against the live service, not just mocks.
- Everything under "Out-of-scope callouts" above was left untouched, confirmed by scope: no `RoomProvider`/`LiveblocksProvider`/canvas wiring, no `types/canvas.ts`, no presence UI, no `broadcastEvent`/`LiveList` usage, no `lib/project-access.ts` changes (diff-empty, confirmed), no canvas snapshot/Blob storage code.

## QA Report

**Overall verdict: PASS**

### Mechanical gate

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass — no errors |
| `npx eslint .` | Pass — 0 errors, 1 pre-existing warning in `.agents/skills/.../__root.tsx` (unrelated to this spec, not touched) |
| `npx next build` | Pass — build succeeds with `LIVEBLOCKS_SECRET_KEY` unset in `.env.local`, confirming the lazy-client decision holds |
| `npx vitest run` | Pass — 131/131 tests across 19 files |

### Acceptance criteria checklist

1. `Presence` type in `liveblocks.config.ts` matches `{ cursor: { x: number; y: number } | null; thinking: boolean }` exactly, field name `thinking` — **Pass**.
2. `UserMeta` type carries user ID, display name, avatar URL, cursor color (`{ id: string; info: { name; avatar; color } }`) — **Pass**.
3. Cached Liveblocks Node client exported from `lib/liveblocks.ts`, module-level singleton cached on `globalThis`, instantiated once per process (verified by singleton test and by reading the implementation) — **Pass**. Note: instantiation is lazily deferred to first call rather than eager at import time (deliberate, documented decision to keep `next build`'s page-data collection from failing with no secret set); this still satisfies "not re-created per request" since the `globalThis` cache is checked on every call.
4. `getCursorColor(userId)` in `lib/liveblocks-color.ts` is a pure string-hash → fixed 8-color palette mapping, no randomness/state — **Pass**, confirmed by code read and by `liveblocks-color.test.ts`'s determinism/edge-case tests.
5. `POST /api/liveblocks-auth` returns 401 with no signed-in session — **Pass**, verified via `getProjectAccess`'s `unauthenticated` discriminant and covered by test.
6. Route resolves room/project ID from the request body (`{ room }`) and calls `getProjectAccess(room)` — **Pass**.
7. Route returns 403 when authenticated but neither owner nor collaborator — **Pass**, covered by test.
8. Room existence check/creation is idempotent via `liveblocks.getOrCreateRoom(roomId, { defaultAccesses: [] })`, confirmed against the real `@liveblocks/node` type definitions (`getOrCreateRoom` is the SDK's own idempotent create-or-fetch primitive) — **Pass**.
9. On success, returns a Liveblocks session token whose `userInfo` includes name, avatar, and `getCursorColor`-derived color — **Pass**, verified against `Session`/`prepareSession`/`authorize()`'s real SDK types and the route-test's success-path assertions.
10. No `RoomProvider`/`LiveblocksProvider`/canvas/presence UI added — **Pass**, confirmed via repo-wide grep (no matches outside spec docs) and via the isolated commit diff (`40f4dfc..c6ce0fb`, 11 files, all within `liveblocks.config.ts`/`lib/liveblocks*`/`app/api/liveblocks-auth`/`package.json`/docs).
11. `npm run build` (`next build`) passes — **Pass**.

All 11 acceptance criteria pass.

### Architecture invariants (`context/architecture-context.md`)

- Realtime Conventions: `Presence` shape matches the pinned spec exactly (`thinking`, not `isThinking`) — confirmed.
- Invariant 1 (no long-running AI work in request handlers): N/A, not applicable to this spec — confirmed no violation.
- Invariant 2 (metadata vs. blob storage separation): N/A — no storage code added.
- Invariant 3 (auth/ownership enforced at every mutation boundary): the route enforces Clerk auth (401) then `getProjectAccess` owner-or-collaborator check (403) before the room-creation side effect (`getOrCreateRoom`) — confirmed enforced ahead of the only mutating call in this route.
- Invariant 4/5: N/A to this spec.

No invariant violations found.

### Standards compliance (`context/code-standards.md`)

- No `any` usage in changed files (grep confirms) — Pass.
- `components/ui/*` untouched — confirmed via isolated commit diff.
- Hex values exist in `lib/liveblocks-color.ts` (`CURSOR_COLORS` palette). These are not Tailwind classes or component styling — they're data values assigned to Liveblocks presence metadata, to be consumed as inline style values by a future spec's presence UI (spec 19), not used in any `className` here. Judged not to violate the "no raw Tailwind color classes / hardcoded hex values" styling rule, since that rule is scoped to component styling and no UI is rendered in this spec. Flagged for awareness, not logged as a bug.
- Route handler is thin, single-responsibility, uses the shared `errorResponse` helper for consistent response shapes — Pass.
- Test file conventions (co-located `*.test.ts`, Clerk/Prisma-equivalent dependencies mocked via `vi.mock`/`vi.hoisted`) followed correctly.

### Error handling

- 400 malformed JSON body / missing `room` / non-string `room`.
- 401 unauthenticated (both the initial `getProjectAccess` check and a defensive re-check after a null `currentUser()` race).
- 404 project not found, 403 forbidden (authenticated, non-member).
- 500 when the Liveblocks client can't be constructed (missing secret).
- 502 when the Liveblocks API call itself throws (room creation or session authorization failure).
All paths are unit-tested in `app/api/liveblocks-auth/route.test.ts` (12 tests) with the failure precedence documented and justified in Dev Notes decision #4 (a reasonable reading of the brief's Open Questions #4, which explicitly left this as a recommendation rather than a settled requirement).

### Housekeeping

- `context/progress-tracker.md` updated: spec 10 moved into "In Progress" with an accurate, itemized summary of what was built, commands run, and the known live-verification limitation; "Next Up" correctly updated to point at this QA pass. Confirmed via `git diff 40f4dfc c6ce0fb -- context/progress-tracker.md`.

### Other verification performed

- Cross-checked `getOrCreateRoom`, `prepareSession`/`Session.allow`/`Session.authorize`, `AuthResponse` shape, `CreateRoomOptions`/`defaultAccesses`, and the `declare global { interface Liveblocks { ... } }` type-augmentation pattern directly against `node_modules/@liveblocks/node/dist/index.d.ts` and `node_modules/@liveblocks/core`'s type declarations — all match the Dev Notes' claims; nothing hallucinated.
- Confirmed `@liveblocks/node` and `@liveblocks/client` are genuinely present in `package.json`, `package-lock.json`, and `node_modules/@liveblocks/*`.
- Confirmed `.env.local` contains only an empty, commented `LIVEBLOCKS_SECRET_KEY=` placeholder (gitignored) — no secret leaked, matches Dev Notes.
- Per this task's instructions, live end-to-end verification against the real Liveblocks service was not attempted (no `LIVEBLOCKS_SECRET_KEY` provisioned in this environment) — treated as a documented, expected limitation, not a bug.

### Issues found

None. No `[Bug → Dev]` or `[Spec gap → Analyst]` items to log.

### Handoff

QA passed — ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Success criteria fit

This spec is infrastructure-only by explicit design (Analyst Brief scope statement, confirmed by Dev Notes and QA's grep/diff check) — no UI, no `RoomProvider`, no canvas. Judged against `project-overview.md`'s Success Criteria:

- **Criterion 2** ("Multiple users can collaborate in the same canvas simultaneously") is the criterion this spec serves. It does not itself deliver visible collaboration — there is no canvas yet (that's spec 11) — but it delivers the actual authorization boundary that makes shared-room access safe: `getOrCreateRoom(roomId, { defaultAccesses: [] })` means no client can join a Liveblocks room without passing through this route's `getProjectAccess` check first. That's the load-bearing piece spec 11 needs to exist before wiring `RoomProvider`. Consistent with how spec 08 (workspace shell) and spec 09 (share dialog) were each judged in prior rounds as necessary preconditions rather than end-to-end demonstrations of a criterion.
- No other Success Criterion (1, 3, 4, 5, 6) is touched by this spec, and none needed to be — none of its deliverables claim to.
- `Presence`/`UserMeta` shapes matter beyond this spec: they're pinned exactly per `architecture-context.md`'s Realtime Conventions (`thinking`, not `isThinking`) and per the brief's Open Question #5 recommendation (`{ id, info: { name, avatar, color } }`), which is the shape spec 19 is documented to consume. Getting this shape right now avoids a costly rework later — confirmed correct by both Dev Notes and QA's read against the real SDK types.

### Scope check against project-overview.md

No crossing into Out of Scope (billing, permission tiers beyond owner/collaborator, versioned spec history, production object storage, mobile). Also cleanly held the line on this spec's own explicit Out-of-scope callouts: no `RoomProvider`/`LiveblocksProvider`/canvas wiring, no `types/canvas.ts`, no presence UI, no `broadcastEvent`/`LiveList` usage, no `lib/project-access.ts` changes (confirmed diff-empty by both Dev and QA). `prisma/schema.prisma` untouched, consistent with the brief's "no Prisma schema changes needed" dependency note — rooms are Liveblocks-managed, not relational.

### Rough edges — acceptable at this stage

- **No live end-to-end verification against the real Liveblocks API** (no `LIVEBLOCKS_SECRET_KEY` provisioned in this environment). This is a human-provisioning gap, not a pipeline defect — same category as spec 09's unopened PR blocker. It's explicitly flagged in Dev Notes and QA's report rather than hidden, and the lazy-client design was specifically chosen so its absence doesn't break `next build`. This does not block spec 11 from building correctly on top of the auth route's *logic* (which is unit-tested against the real SDK's types), but the human should provision a real Liveblocks project/secret before spec 11's `RoomProvider` wiring can be verified end to end — worth surfacing now rather than letting it surface as a surprise blocker two specs from now.
- **Cursor-color palette and UserMeta shape** were both decisions the spec text left open and the brief flagged as recommendations rather than settled requirements (Open Questions #3, #5). Dev's choices are reasonable, consistent with existing UI tokens and downstream spec 19's documented expectations, and explicitly flagged as "not settled" — appropriate for this stage per `ai-workflow-rules.md`'s incremental philosophy (don't invent unflagged product behavior; do flag genuine ambiguity rather than silently resolving it).

### progress-tracker.md accuracy

The "In Progress" entry for spec 10 accurately reflects what was actually delivered and verified: correct file list, correct framing of the missing-secret-key limitation, correct test/build command results (131/131 tests, build passing with the secret unset). It does not overstate this as "collaboration works" — it correctly scopes the claim to infrastructure. No correction needed to the entry's content itself; per this pipeline's process it should now move from "In Progress" to "Completed" (with the PR link) once a PR exists — see below.

### PR creation — blocked, not attempted

Per this task's instructions, `gh` availability was verified before touching the PR step:

- `git branch -a --list "spec/10-liveblocks-setup"` confirms the branch exists off `main` with one commit ahead (`c6ce0fb`), so there is real work to hand off.
- `gh --version` and `gh auth status` both returned `command not found` in this shell session — `gh` is not on PATH here, consistent with the known winget-install-needs-new-session issue and the not-yet-completed `gh auth login`.

Per instructions, I am stopping here rather than working around this: no push, no `gh pr create` attempted, and no `progress-tracker.md` "Completed"/"Current Phase"/"Next Up" update made, since that update is gated on a successful PR. The Product Owner review verdict above stands as PASS on the merits — the PR/tracker-update steps are a separate, mechanical blocker for the human to clear (open a new shell session so `gh` picks up PATH, then run `gh auth login`).
