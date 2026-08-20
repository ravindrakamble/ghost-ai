# Spec 19 — Presence Avatars & Cursor

## Analyst Brief

### Scope statement

This spec adds a top-right collaborator avatar group (overlapping avatar stack + the existing Clerk `UserButton` for the current user, divided by a separator only when collaborators exist) and live cursors for other participants, both rendered exclusively inside the editor canvas view (`components/editor/canvas.tsx`'s tree). It does not touch the shared `EditorNavbar`, does not add any new navbar actions, does not make avatars interactive, and does not change canvas node/edge rendering or mutation logic.

### Concrete deliverables

**Modified: `components/editor/canvas.tsx`**

`CanvasFlow` (the component that already sits inside `RoomProvider`/`ReactFlowProvider` and already calls `useReactFlow()` for `screenToFlowPosition`) gains:

- `const updateMyPresence = useUpdateMyPresence()` (from `@liveblocks/react/suspense` — same module this file already imports `useUndo`/`useRedo`/`useRoom` from, confirmed exported at `node_modules/@liveblocks/react/dist/suspense.d.ts`, no new dependency).
- Two new `<ReactFlow>` props, **verified as real, first-class, documented props** (not prop-passthrough guesswork) by reading `node_modules/@xyflow/react/dist/esm/types/component-props.d.ts` directly:
  - `onPaneMouseMove={(event) => updateMyPresence({ cursor: screenToFlowPosition({ x: event.clientX, y: event.clientY }) })}` — this **is** "React Flow's onMouseMove event" the spec's own text refers to: `onPaneMouseMove` is React Flow's own named pane-level mouse-move handler (sibling of the already-familiar `onPaneClick`), not a generic DOM `onMouseMove` passthrough.
  - `onPaneMouseLeave={() => updateMyPresence({ cursor: null })}` — satisfies "clear cursor to null on mouse leave" the same way, via React Flow's own named pane-leave handler.
- Cursor position is stored in **flow-space coordinates** (`screenToFlowPosition`'s output), not raw screen/client coordinates — a judgment call, not literally pinned by the spec's `{ x, y }` text, but verified as the correct choice by reading `@liveblocks/react-flow`'s own bundled `<Cursors />` implementation (`node_modules/@liveblocks/react-flow/dist/cursors.js`, not reused directly — see Open Questions #1 — but read as a reference), which does exactly this so a cursor's rendered position tracks its real target point on the canvas regardless of each individual viewer's own pan/zoom state, rather than pointing at the wrong spot for anyone whose viewport differs from the broadcaster's.
- Renders two new components as further siblings of `<ReactFlow>`/`ShapePanel`/`CanvasControlBar`/`StarterTemplatesModal` (same convention every prior canvas-overlay spec already uses — no new context, no new wrapper div, positioned via `absolute` inside `Canvas`'s existing `relative flex-1 bg-base` wrapper):
  - `<PresenceAvatars />` — the collaborator stack + `UserButton`, positioned `absolute top-4 right-4` (or an equivalent top-right offset — exact spacing is a Dev-level choice, same footing as `CanvasControlBar`'s `bottom-24 left-6`).
  - `<LiveCursors />` — the other-participants' cursor overlay.

**New: `components/editor/presence-avatars.tsx`**

- A client component rendering, left to right: the collaborator avatar stack (only if non-empty), a divider (only if the stack is non-empty), then the existing Clerk `<UserButton />` (imported from `@clerk/nextjs`, the same import `components/editor/editor-navbar.tsx` already uses — reused as-is, no new profile/logout UI).
- Current user ID: `const { user } = useUser()` from `@clerk/nextjs` (Clerk's client hook — first use of this hook in the codebase; `editor-navbar.tsx`'s existing `<UserButton />` doesn't need it since it reads the session internally). This is the literal "get the current user's ID from the active Clerk session" instruction — deliberately *not* `useSelf().id` from Liveblocks, even though both resolve to the same string today (`app/api/liveblocks-auth/route.ts` passes `caller.id`, the Clerk user ID, as the Liveblocks session's user ID) — the spec's text specifically names the Clerk session as the source.
- Collaborator list: `useOthers()` (from `@liveblocks/react/suspense`), filtered to `other.id !== user?.id`. This filter is **not redundant** with Liveblocks' own others/self split: `useOthers()` already excludes the *current connection*, but the same authenticated user with a second browser tab open in the same room would appear as a separate `other` entry with the *same* `id` and a different `connectionId` — the explicit Clerk-ID filter is what correctly excludes that second-tab-of-yourself case, not just a literal restatement of what Liveblocks already does. Worth documenting inline since it's not obvious from the spec's terse phrasing alone.
- Performance: per this repo's own bundled Liveblocks skill guidance (`.claude/skills/liveblocks-best-practices/references/performant-others-and-presence.md`, already present in this codebase), a plain `useOthers()` re-renders on *every* presence change from *any* participant — including cursor moves broadcast many times per second — which would make the avatar stack (which only cares about who's present, not where their cursor is) re-render constantly for no visual benefit. Recommend selecting only the fields this component needs with the `shallow` comparator: `useOthers((others) => others.map((o) => ({ id: o.id, info: o.info })), shallow)` (`shallow` from the same `@liveblocks/react/suspense` module) — or `useOthersConnectionIds()` if Dev prefers an even coarser join/leave-only re-render boundary. This is a quality recommendation grounded in the project's own reference material, not a hard requirement the spec text states explicitly.
- Rendering: first 5 collaborators as an overlapping stack (recommend shadcn's `Avatar`/`AvatarImage`/`AvatarFallback` primitives — see Open Questions #2 — each showing `other.info.avatar` as the image source and initials derived from `other.info.name` as the fallback), a `+N` chip if more than 5 remain, a subtle ring on each avatar, `aria-hidden`/no `onClick`/no `href`/no hover affordance anywhere (display-only, per Scope Limits).
- Sizing: collaborator avatars and `<UserButton />` must render at the same visual size. Clerk's `UserButton` needs its size set via its own documented `appearance` prop (`appearance={{ elements: { userButtonAvatarBox: "h-8 w-8" } }}` or equivalent) rather than a wrapping CSS class, since `UserButton` renders its own internal DOM structure that a plain className override isn't guaranteed to reach — pick one fixed size (e.g. `h-8 w-8`, matching the Icons convention's `h-8 w-8` "feature icon" scale) and apply the identical dimension to both.

**New: `components/editor/live-cursors.tsx`**

- A client component rendering one cursor per other participant with a non-null `cursor` in their presence.
- Per the same performant-presence guidance cited above: use `useOthersConnectionIds()` (updates only on join/leave) to get the list of connection IDs to render, then a per-cursor child component that calls `useOther(connectionId, (other) => other.presence.cursor)` (and `other.info`) so each cursor only re-renders when *its own* presence changes, not on every other participant's move — the same per-cursor-subscription shape `@liveblocks/react-flow`'s own `<Cursors />`/`PresenceCursor` internals use (read directly from `node_modules/@liveblocks/react-flow/dist/cursors.js` as a reference, not imported/reused — see Open Questions #1).
- Same Clerk-ID-based self-exclusion reasoning as `PresenceAvatars` applies here too (never render the current user's own cursor, including a second tab of the same user) — filter on `other.id !== user?.id`, `user` again from Clerk's `useUser()`.
- Positioning: convert each cursor's stored flow-space `{ x, y }` back to screen coordinates via `flowToScreenPosition` (from the same `useReactFlow()` call `CanvasFlow` already has — confirmed a real method on `useReactFlow()`'s return type at `node_modules/@xyflow/react/dist/esm/types/general.d.ts`), then render each cursor as a `position: fixed` (or absolutely positioned relative to the canvas's own bounding rect) element at that point — exact positioning mechanics are a Dev-level implementation choice, but must use `flowToScreenPosition` rather than treating the stored coordinates as already screen-relative, since they were captured via `screenToFlowPosition` on write.
- Visual: a small colored pointer shape (e.g. a simple inline SVG cursor/arrow) plus a name badge, both colored from `other.info.color` (already resolved server-side in `app/api/liveblocks-auth/route.ts` via `lib/liveblocks-color.ts`'s `getCursorColor(caller.id)` and delivered as part of `UserMeta.info` at session-auth time — read directly off `other.info.color`, do not recompute `getCursorColor` client-side). Badge text from `other.info.name`. Styling (pill shape, size) is a Dev-level choice; recommend the same "runtime data drives an inline color" pattern already established for `--swatch-glow` (spec 15) — a CSS custom property set from `other.info.color`, not a hardcoded class.
- `aria-hidden` on the whole overlay (display-only, matches `@liveblocks/react-flow`'s own `<Cursors />` convention of marking its cursor layer `aria-hidden`).

**New (via `shadcn` CLI, not hand-written): `components/ui/avatar.tsx`**

- Per `ui-context.md`'s Component Library convention ("Use the `shadcn` CLI to add new components rather than writing them from scratch") and `ai-workflow-rules.md`'s Protected Foundation Components section — run `npx shadcn add avatar` to generate this the same way `Button`/`Dialog`/etc. were added in spec 01, rather than a hand-rolled `<img>`+fallback `<div>`. This also solves the "profile photo vs. initials fallback" requirement for free: shadcn's `Avatar`/`AvatarImage`/`AvatarFallback` (built on the same `@base-ui/react` primitives as this project's other shadcn components) already implements image-load-failure → fallback natively, so a broken/slow-loading `avatar` URL degrades to initials automatically, not just a literally-empty `avatar` string. `package.json` will pick up whatever the CLI adds, the same way spec 01's initial shadcn install did.

**Confirmed, not modified: `liveblocks.config.ts`**

- Already defines `Presence` (`cursor: { x: number; y: number } | null`, `thinking: boolean`) and `UserMeta` (`{ id: string; info: { name, avatar, color } }`) in exactly the shape this spec's Implementation step 5 asks for — this was deliberately pinned ahead of time in `architecture-context.md`'s "Realtime Conventions" specifically so this spec (named there by number) wouldn't diverge. No changes needed here; Dev should confirm-by-reading, not re-author.

**Confirmed, not modified: `app/api/liveblocks-auth/route.ts`**

- Already resolves and sends the Clerk `name`/`avatar` (`caller.imageUrl`)/`color` (`getCursorColor(caller.id)`) as `userInfo` at `prepareSession(caller.id, { userInfo: { name, avatar, color } })` time (spec 10). This is exactly the data `PresenceAvatars`/`LiveCursors` read off `other.info`/`useUser()` — nothing new needs to flow from the server for this spec.

**Modified: `context/ui-context.md`**

- New "Presence Avatars & Cursor" section under Canvas, documenting the top-right avatar-stack convention, the `onPaneMouseMove`/`onPaneMouseLeave` cursor-broadcast mechanism, the flow-space coordinate-storage decision, and the Clerk-ID self-exclusion reasoning — following the same documentation pattern every prior canvas-feature spec (12 through 18) already established.

**Tests**, per `code-standards.md`'s Testing section: `components/editor/presence-avatars.test.tsx` (new — self excluded by Clerk ID including a same-user-different-connection case, divider only with ≥1 collaborator, overflow chip past 5, `UserButton` sizing prop present, no interactive affordances), `components/editor/live-cursors.test.tsx` (new — self excluded, null-cursor participants render nothing, color/name sourced from `other.info`), `components/editor/canvas.test.tsx` (extended — `onPaneMouseMove`/`onPaneMouseLeave` wired to `useUpdateMyPresence`'s update function with the right shape, `PresenceAvatars`/`LiveCursors` rendered).

### Acceptance criteria

Directly from the spec's own "Check When Done" list, expanded with the underlying "Implementation" detail:

1. Presence avatars (collaborator stack + `UserButton`) render only inside the canvas view (`Canvas`/`CanvasFlow`'s own tree) — never in the shared `EditorNavbar`, and never on `/editor` (the project list home), which never mounts `Canvas` at all.
2. `components/editor/editor-navbar.tsx` is byte-for-byte unchanged.
3. `components/editor/workspace-navbar.tsx`'s existing Templates/Share/AI-toggle buttons are unchanged and remain functional — the presence UI is a separate canvas-area overlay, not inserted into that navbar.
4. The current user's ID is resolved via Clerk's `useUser()` client hook (`@clerk/nextjs`), not `useSelf()` or any other source.
5. The collaborator avatar list excludes any Liveblocks "other" whose `id` matches the current Clerk user's ID — including a second connection from the same user (multi-tab), not just the trivially-already-excluded current connection.
6. The current user's own avatar is rendered exclusively via the existing Clerk `UserButton` — no second, presence-sourced avatar element for them anywhere.
7. A divider renders between the collaborator stack and `UserButton` only when at least one collaborator is present; with zero collaborators, only `UserButton` renders, with no divider.
8. Collaborator avatars show a real profile photo when available, initials otherwise; at most 5 render in an overlapping stack; a `+N` chip appears for any remainder beyond 5; each avatar has a subtle ring; none of them are clickable or otherwise interactive.
9. Collaborator avatars and `UserButton` render at the same fixed visual size.
10. Cursor position updates the room's Presence `cursor` field via `onPaneMouseMove` (React Flow's real, named pane-mouse-move prop) and is cleared to `null` via `onPaneMouseLeave`.
11. Cursors render for other participants only — never the current user's own cursor, including from a second tab of the same account — as a small colored pointer with an attached name badge, both colored to match that participant's own `info.color`.
12. `liveblocks.config.ts`'s `Presence`/`UserMeta` types are confirmed already matching this spec's required shape (no changes needed there).
13. No changes to `canvas-node.tsx`, `canvas-edge.tsx`, `shape-visual.tsx`, `node-color-toolbar.tsx`, or any Storage-backed node/edge mutation path (`onNodesChange`/`onEdgesChange`/`onConnect`/`onDelete`) — this spec is Presence-only.
14. `npm run build` passes (the spec's own explicit check), applying the project's standard full gate: `npx tsc --noEmit`, `npx eslint .`, and `npx vitest run` all pass too.

### Dependencies

- Spec 10 (Liveblocks Setup) — **complete**. `liveblocks.config.ts`'s `Presence`/`UserMeta` types already match this spec's required shape exactly; `app/api/liveblocks-auth/route.ts` already resolves and sends Clerk `name`/`avatar`/`color` (via `lib/liveblocks-color.ts#getCursorColor`) as `userInfo` at session-auth time — the data this spec's UI reads is already flowing into the room with no server-side changes needed.
- Spec 11 (Base Canvas) — **complete**. Provides `RoomProvider` (`initialPresence={{ cursor: null, thinking: false }}`) and `CanvasFlow`'s existing `useReactFlow()` call (`screenToFlowPosition`, and now also `flowToScreenPosition`) this spec's cursor mechanism reads/writes through.
- Spec 08 (Editor Workspace Shell) — **complete**. Establishes `WorkspaceShell`/`WorkspaceNavbar` as the room-scoped (never rendered on `/editor` home) shell this spec's presence UI lives inside, and `EditorNavbar` as the separate, shared, cross-route navbar this spec must not touch.
- Clerk authentication (pre-spec-06 baseline) — **complete**. `EditorNavbar`'s existing `<UserButton />` usage is the direct precedent this spec's `PresenceAvatars` reuses; this is the first spec to also call Clerk's `useUser()` client hook.

All listed dependencies are complete per `progress-tracker.md`.

### Open questions

1. **Should this spec use `@liveblocks/react-flow`'s own bundled `<Cursors />` component instead of hand-rolling cursor tracking/rendering?** Considered and **not recommended**, for three concrete reasons found by reading the installed source (`node_modules/@liveblocks/react-flow/dist/cursors.js`):
   - Its default cursor visual (`DefaultCursorWithUserInfo`) resolves user info via Liveblocks' `useUser(userId)` hook, which in turn requires a `resolveUsers` callback configured on `LiveblocksProvider` (`components/editor/canvas.tsx`) to work at all — without one, `useUser` either stays loading forever or throws a "resolveUsers didn't return anything" error. This project's `LiveblocksProvider` has no `resolveUsers` configured, and adding one would be new, unrequested machinery (a resolver re-deriving info the room's own `UserMeta.info` — already populated at auth time — already has) just to make a pre-built component work.
   - Its default cursor visual imports `Cursor` from `@liveblocks/react-ui`, a package present in `node_modules` only as a *transitive* dependency of `@liveblocks/react-flow` — not a direct `package.json` dependency of this project. Relying on it directly is fragile (could silently break on a version bump of `@liveblocks/react-flow` that changes its own dependencies) and its shipped CSS isn't built from this project's dark-theme tokens (`ui-context.md`: "no raw Tailwind color classes... use these tokens"), unlike every other canvas-visual element in this codebase (`ShapePanel`, `CanvasNode`, `CanvasEdge`, `CanvasControlBar` are all hand-built with project tokens).
   - This spec's own text is prescriptive about the exact visual ("a small colored pointer with a name badge... match the pointer and badge color to the participant's presence color") in a way a pre-styled foreign component wouldn't cleanly satisfy without deep CSS-variable overrides anyway.

   **Recommendation**: hand-roll `LiveCursors`, reusing the *mechanism* the library's own source demonstrates (flow-space coordinate storage, per-connection `useOther` subscriptions for render isolation) but writing the *visual* directly with this project's own tokens/`other.info.color`, matching how every other canvas overlay in this codebase is built. This is a real architectural decision with evidence behind it, not an unexamined default — flagging it explicitly in case a human reviewer prefers pulling in `@liveblocks/react-ui` + `resolveUsers` as a tradeoff for less custom code.

2. **Exact positioning/sizing of the avatar stack, ring, divider, cursor pointer shape, and badge styling aren't pinned by `ui-context.md`.** Recommended, Dev-level defaults given in Concrete Deliverables above (`top-4 right-4`, `ring-border-subtle` — reusing the exact token `ui-context.md`'s own palette table already names "Subtle border," a direct textual match to the spec's "a subtle ring" phrasing rather than an arbitrary pick — `h-8 w-8` avatar size, a `bg-surface-border` 1px divider matching `CanvasControlBar`'s existing divider convention). Same footing as spec 18's Open Questions #5 (modal width/grid) — no prior pinned convention beyond the token/radius scale, left to Dev within those bounds.

3. **Should the current-user-ID filter be duplicated identically in both `PresenceAvatars` and `LiveCursors`, or factored into a shared hook?** The spec's Implementation text states the filter once (step 2) but the "never render the current user's own cursor" requirement in step 4 is the same underlying rule applied to a second surface. Recommend a small shared hook (e.g. `hooks/use-current-user-id.ts` wrapping Clerk's `useUser()`) or a shared filter utility, purely to avoid duplicating the same `other.id !== currentUserId` logic in two files — a Dev-level code-organization choice, not a product-behavior one, and not required by the spec text to be a single mechanism.

4. **Broken/slow-loading avatar images beyond a literally-empty `avatar` string.** The spec's text says "use profile photos when available, fall back to initials when there is no image" — literally about *absence*, not load failure. In practice Clerk's `imageUrl` is close to always non-empty (Clerk generates a default avatar for every account), so the literal "no image" case may rarely trigger; a real image-*load*-failure case is more likely in practice. Recommend using shadcn's `Avatar`/`AvatarImage`/`AvatarFallback` (Open Questions item folded into Concrete Deliverables above) specifically because it already handles both cases identically and for free, rather than writing a narrower "only handle the empty-string case" check by hand.

### Out-of-scope callouts

- **Any change to the shared `EditorNavbar`** — explicit Scope Limit ("don't add participant avatars to the shared navbar globally"). `EditorNavbar` (top-level, rendered across every `/editor/*` route including the project-list home) stays untouched; the new UI lives entirely inside `Canvas`/`CanvasFlow`, which is never mounted on `/editor` home.
- **Removing or altering `WorkspaceNavbar`'s existing actions** — explicit Scope Limit ("don't remove existing navbar actions like Save, Import, Share, or AI"). Note: as of this spec, `WorkspaceNavbar` only actually has Templates/Share/AI-toggle buttons — no literal "Save" or "Import" button exists yet in this codebase (Save/Import aren't built by any prior spec) — the limit is honored by leaving whatever *does* exist alone, not by inventing missing buttons to protect.
- **Replacing Clerk user/profile/logout behavior** — explicit Scope Limit. `<UserButton />` is reused exactly as `EditorNavbar` already uses it (aside from a size-only `appearance` override), no custom menu items, no custom sign-out flow.
- **Interactive collaborator avatars** — explicit Scope Limit ("don't make collaborator avatars interactive"). No click-to-profile, no hover card, no tooltip beyond what a plain `title` attribute might add (even that is a Dev-level nicety, not required) — display-only.
- **Canvas node/edge rendering or mutation changes** — explicit Scope Limit ("don't change canvas node or edge behavior"). `canvas-node.tsx`, `canvas-edge.tsx`, `shape-visual.tsx`, `node-color-toolbar.tsx`, and the `onNodesChange`/`onEdgesChange`/`onConnect`/`onDelete` mutation paths all stay untouched.
- **The `thinking` presence field / any "AI is working" indicator UI** — `liveblocks.config.ts`'s `Presence.thinking` field already exists (spec 10) and is explicitly reserved for a later spec (24, per `architecture-context.md`'s Realtime Conventions cross-reference). This spec confirms the type is already correct but builds no UI consuming it.
- **Any new `app/api` route, Prisma model, or persisted room-membership history** — presence is fully ephemeral, sourced entirely from the live Liveblocks room connection (per `architecture-context.md`'s Storage Model — presence isn't project metadata or a generated artifact); nothing here touches PostgreSQL or Vercel Blob.
- **AI-generated architecture, spec generation** — later, separate specs (`project-overview.md`'s Core User Flow steps 5–9); unrelated to this spec's text.
- **Billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps** — the remainder of `project-overview.md`'s Out of Scope wall; nothing in this spec's text comes near any of these.

## Handoff

Brief ready for Senior Developer at `context/spec-status/19-presence-avatars-cursor.md`.

## Dev Notes

### Files added

- `hooks/use-current-user-id.ts` — shared `useCurrentUserId()` wrapping Clerk's `useUser()`, per the brief's Open Questions #3 recommendation. Both `PresenceAvatars` and `LiveCursors` use it for the identical Clerk-ID self-exclusion rule.
- `hooks/use-current-user-id.test.ts` — signed-in / no-user cases.
- `components/editor/presence-avatars.tsx` — top-right collaborator avatar stack + Clerk `UserButton`.
- `components/editor/presence-avatars.test.tsx` — self-exclusion (including same-user-second-connection), divider-only-with-collaborators, 5-max-plus-overflow-chip, `UserButton` sizing prop, no interactive affordances.
- `components/editor/live-cursors.tsx` — other-participants' cursor overlay.
- `components/editor/live-cursors.test.tsx` — null-cursor participants render nothing, self-exclusion (including same-user-second-connection), position/color sourced from `other.info`/`flowToScreenPosition`, multiple simultaneous cursors, `aria-hidden`/non-interactive overlay.
- `components/ui/avatar.tsx` — generated via `npx shadcn add avatar` (not hand-written), per `ui-context.md`'s Component Library convention and the brief's Concrete deliverables. Uses this project's own token mapping already wired in `app/globals.css` (`--muted`/`--border` etc. already equal this project's `--bg-subtle`/`--border-default` values), so no manual edits were needed to bring it in line with the dark theme — verified by comparing against `button.tsx`'s existing use of the same shadcn semantic tokens.

### Files modified

- `components/editor/canvas.tsx` — `CanvasFlow` gains `useUpdateMyPresence()`, wires React Flow's real `onPaneMouseMove`/`onPaneMouseLeave` props to broadcast/clear the room's Presence `cursor` field (flow-space coordinates via the existing `screenToFlowPosition`), destructures `flowToScreenPosition` from the same `useReactFlow()` call and threads it down to `<LiveCursors>` as a prop, and renders `<PresenceAvatars />`/`<LiveCursors />` as further siblings of `<ReactFlow>`/`ShapePanel`/`CanvasControlBar`/`StarterTemplatesModal`. No changes to node/edge types, `defaultEdgeOptions`, drag/drop, or any Storage mutation path.
- `components/editor/canvas.test.tsx` — extended: `@liveblocks/react/suspense` mock gained `useUpdateMyPresence`/`useOthers`/`useOthersConnectionIds`/`useOther`/`shallow`; new `@clerk/nextjs` mock (`useUser`, a stubbed `UserButton`); `@xyflow/react` mock's `useReactFlow()` gained `flowToScreenPosition`, plus a `useViewport` stub; `ReactFlow` mock's captured-props type gained `onPaneMouseMove`/`onPaneMouseLeave`. New `describe("presence avatars and cursor (spec 19)")` block: pane-mouse-move broadcasts through `screenToFlowPosition` into `updateMyPresence`, pane-mouse-leave clears `cursor` to `null`, `PresenceAvatars`/`LiveCursors` render for real (not mocked out) and receive live data through the same mocked presence hooks.
- `context/ui-context.md` — new "Presence Avatars & Cursor" section under Canvas, documenting the avatar-stack convention, the `onPaneMouseMove`/`onPaneMouseLeave` broadcast mechanism, the flow-space coordinate-storage decision, self-exclusion reasoning, and the `useOthers`/`useOther` `shallow`-selector performance pattern.

### Skills used

- **liveblocks-best-practices** (`.claude/skills/liveblocks-best-practices/references/performant-others-and-presence.md`) — confirmed the `shallow`-comparator narrowed-selector pattern for `useOthers`/`useOther` cited in the brief, and cross-checked the per-connection `useOther`/`useOthersConnectionIds` render-isolation shape against the skill's own guidance before applying it in both `PresenceAvatars` and `LiveCursors`.

### Key decisions

- **`flowToScreenPosition` threaded as a prop, not re-called via `useReactFlow()`** in `LiveCursors` — matches the brief's explicit "same `useReactFlow()` call `CanvasFlow` already has" phrasing and the established "parent already has the mechanism, pass it down" convention (`CanvasControlBar`'s zoom handlers, `ShapePanel`'s drop handler).
- **`position: fixed`, not `absolute`**, for each rendered cursor — verified by reading `@xyflow/react`'s real source (`node_modules/@xyflow/react/dist/esm/index.js`) that `flowToScreenPosition` already adds the React Flow pane's own `getBoundingClientRect()` offset back into its output, so its return value is viewport-relative client coordinates (the same space `event.clientX`/`clientY` live in). `position: fixed` maps those values directly; `position: absolute` against `LiveCursors`'s own wrapper would double-count that same offset unless manually subtracted back out — not something the brief's text asked for, and a real correctness bug if gotten wrong.
- **`useViewport()` called (for its reactivity only) inside each `LiveCursor`** — not explicitly required by the brief's text, but a deliberate, minimal addition: without it, another participant's rendered cursor position would only update on that participant's own next presence change, going stale during the *local* user's own pan/zoom until then. `@liveblocks/react-flow`'s own reference `<Cursors />` solves this with an imperative `useStoreApi()` transform subscription + direct DOM `ref.style.transform` writes (spring-animated) — judged too large a mechanism to duplicate for what the brief scoped as a Dev-level positioning choice; `useViewport()` (a public, documented `@xyflow/react` hook) achieves the same correctness with a single extra hook call, at the cost of a full component re-render on every pan/zoom frame instead of an imperative-only update. Flagging this as a reasonable but non-required embellishment in case QA/PO judge it out of scope — it's additive UX correctness, not a new mutation path, external dependency, or Presence field.
- **`ring-border-subtle`** (the `--border-subtle` token) chosen for the avatar ring, per the brief's Open Questions #2 recommendation — a direct textual match to "a subtle ring" and the palette table's own "Subtle border" row, not an arbitrary pick.
- **No custom `cursorPresenceEqual`** — `shallow` alone (Liveblocks' own export) is sufficient as the `useOther` `isEqual` argument since the selector's returned object's `cursor` field is the same underlying reference from the room's presence data when unchanged; a one-level shallow compare of `{ id, name, color, cursor }` already avoids re-rendering a cursor whose presence hasn't actually changed.

### Test coverage

- `hooks/use-current-user-id.test.ts` — 2 tests.
- `components/editor/presence-avatars.test.tsx` — 6 tests.
- `components/editor/live-cursors.test.tsx` — 6 tests.
- `components/editor/canvas.test.tsx` — 4 new tests in a `describe("presence avatars and cursor (spec 19)")` block, plus the full existing suite re-verified against the extended mock surface.
- Full suite: **298/298 tests passing across 38 files** (up from 280/35 at the end of spec 18).

### Gate results

- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass, 0 errors (1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/...`, unrelated to this spec, not touched).
- `npx vitest run` — pass, 298/298.
- `npx next build` — pass, compiles and type-checks cleanly, all routes generate.

### Known limitations / deliberate deferrals

- No live two-tab/multiplayer browser verification was possible in this pipeline (consistent with every prior canvas spec, 11–18) — the mechanism (Presence `cursor` field read/write, `onPaneMouseMove`/`onPaneMouseLeave`, `useOthers`/`useOther` selectors) is verified against the real installed Liveblocks/React Flow source and covered by unit tests, but a human smoke test (two tabs, same account in a second tab to confirm self-exclusion, cursor tracking through pan/zoom, avatar overflow past 5 collaborators) is recommended before considering this fully proven.
- `useViewport()`'s re-render-on-every-pan/zoom-frame cost (see Key Decisions above) wasn't benchmarked against the reference implementation's imperative-DOM approach — likely negligible given `LiveCursors` only mounts up to a handful of children per room, but flagging it as an unverified assumption rather than a measured one.
- No `title`/tooltip beyond the plain `title` HTML attribute on each collaborator avatar (shows the collaborator's name on native browser hover) — the brief calls this a Dev-level nicety, not a requirement; no custom hover card or tooltip component was added.

## QA Report

Overall verdict: **PASS**. All four mechanical gate commands pass, every numbered acceptance criterion (1-14, per the Analyst Brief's expanded list, which maps 1:1 to the spec's own "Check When Done" plus its "Implementation" detail) verified independently against the actual code, and the diff is scoped exactly as the Dev Notes claim -- no `canvas-node.tsx`/`canvas-edge.tsx`/`shape-visual.tsx`/`node-color-toolbar.tsx`/`editor-navbar.tsx`/`workspace-navbar.tsx` changes, no new `app/api` route, no `components/ui/*` file touched other than the new CLI-generated `avatar.tsx`. One non-blocking housekeeping note below.

### Mechanical gate -- reproduced independently

- `npx tsc --noEmit` -- PASS, no errors.
- `npx eslint .` -- PASS, 0 errors, 1 pre-existing warning in `.agents/skills/clerk-tanstack-patterns/templates/tanstack-basic-auth/src/routes/__root.tsx` (`no-head-element`), confirmed unrelated to this spec (not in the diff).
- `npx vitest run` -- PASS, 298/298 across 38 files, matching the Dev Notes claimed figures exactly.
- `npx next build` -- PASS, Turbopack compile clean, TypeScript clean, all 10 routes generated.

### Diff scope -- independently reproduced via `git diff spec/18-starter-template`

11 files changed, all consistent with the Dev Notes' "Files added"/"Files modified" lists: `hooks/use-current-user-id.ts` (+test), `components/editor/presence-avatars.tsx` (+test), `components/editor/live-cursors.tsx` (+test), `components/ui/avatar.tsx` (new), `components/editor/canvas.tsx` + its test, `context/ui-context.md`, `context/spec-status/19-presence-avatars-cursor.md`. `git diff spec/18-starter-template -- components/editor/editor-navbar.tsx components/editor/workspace-navbar.tsx` is empty (confirmed both byte-for-byte unchanged). No `canvas-node.tsx`/`canvas-edge.tsx`/`shape-visual.tsx`/`node-color-toolbar.tsx`/`types/canvas.ts` in the diff at all.

### Acceptance criteria -- independently re-verified against code

1. Presence avatars render only inside `Canvas`/`CanvasFlow`'s tree, never in `EditorNavbar`, never on `/editor` home -- PASS. `<PresenceAvatars>`/`<LiveCursors>` are rendered only as siblings of `<ReactFlow>` inside `CanvasFlow` (`components/editor/canvas.tsx:473-474`); `EditorNavbar` has zero references to either component or to Liveblocks presence hooks.
2. `editor-navbar.tsx` byte-for-byte unchanged -- PASS. Empty diff confirmed.
3. `workspace-navbar.tsx`'s Templates/Share/AI-toggle buttons unchanged and functional -- PASS. Empty diff confirmed; the presence UI lives entirely in `Canvas`'s own wrapper, rendered in a separate DOM subtree below `WorkspaceNavbar` (`workspace-shell.tsx`'s layout), not inserted into it.
4. Current user ID resolved via Clerk's `useUser()`, not `useSelf()` -- PASS. `hooks/use-current-user-id.ts` calls `useUser()` from `@clerk/nextjs` exclusively; no `useSelf` import anywhere in the diff.
5. Collaborator list excludes the current user by Clerk ID, including a same-account second connection -- PASS. `presence-avatars.tsx`'s `collaborators = others.filter((other) => other.id !== currentUserId)` and `live-cursors.tsx`'s equivalent check both filter on the Clerk-sourced ID, not connection identity. Both test suites include an explicit "second connection of the same account" case (e.g. `makeOther("user_me", 2, "Me (second tab)")` style fixtures) that exercises this and passes.
6. Current user's own avatar rendered only via `UserButton`, never a second presence-sourced avatar -- PASS. `PresenceAvatars` renders the filtered `collaborators` list (which never contains the current user) plus one `<UserButton>`; no unfiltered rendering path exists.
7. Divider only when at least one collaborator present -- PASS, both by code inspection (`{collaborators.length > 0 && <div ... bg-surface-border />}`) and by the passing "no divider when zero collaborators" / "divider present with one collaborator" test pair.
8. Real photo / initials fallback, at most 5 in overlapping stack, `+N` chip beyond 5, subtle ring, non-interactive -- PASS. `AvatarImage`/`AvatarFallback` (shadcn) handle photo-vs-initials including load-failure; `MAX_VISIBLE_COLLABORATORS = 5` + `.slice`; `ring-2 ring-border-subtle` on both avatars and the overflow chip; no `onClick`/`href`/button role anywhere in the collaborator stack (confirmed by both reading the code and the passing "no interactive affordances" test).
9. Collaborator avatars and `UserButton` render at the same fixed size -- PASS. Both use the shared `AVATAR_SIZE_CLASS = "h-8 w-8"` constant -- applied directly as a class on `Avatar` and via `UserButton`'s own `appearance={{ elements: { userButtonAvatarBox: "h-8 w-8" } }}` prop (correctly not a wrapping className, since `UserButton` renders its own internal DOM).
10. Cursor position broadcast via `onPaneMouseMove` (real, named React Flow pane prop, confirmed at `node_modules/@xyflow/react/dist/esm/types/component-props.d.ts:200-202`) and cleared via `onPaneMouseLeave` -- PASS. `canvas.tsx`'s `handlePaneMouseMove`/`handlePaneMouseLeave` call `updateMyPresence` (real `useUpdateMyPresence()` from `@liveblocks/react/suspense`) with `screenToFlowPosition(...)`/`null` respectively, wired directly to `<ReactFlow onPaneMouseMove={handlePaneMouseMove} onPaneMouseLeave={handlePaneMouseLeave}>`. Independently confirmed this is not a generic `window`/DOM `mousemove` listener -- no such listener exists anywhere in the diff. `canvas.test.tsx`'s new tests assert the real prop is invoked and calls through to `updateMyPresence` with the correct shape.
11. Cursors render for other participants only, colored/badged to match `info.color` -- PASS. `live-cursors.tsx` filters `other.id === currentUserId` (returns `null`) and reads `other.color`/`other.name` directly off `other.info` (via the `useOther` selector), setting `--cursor-color` from `other.info.color` (never recomputed client-side) and using it for both the SVG pointer fill and the badge background.
12. `liveblocks.config.ts` `Presence`/`UserMeta` types already match spec -- PASS, confirmed by reading the file directly: `cursor: { x: number; y: number } | null`, `thinking: boolean`, `UserMeta.info: { name, avatar, color }` -- no diff to this file, correctly so.
13. No changes to node/edge rendering or mutation paths -- PASS. Confirmed via targeted `git diff` (empty for `canvas-node.tsx`/`canvas-edge.tsx`/`shape-visual.tsx`/`node-color-toolbar.tsx`); `canvas.tsx`'s diff is additive only (`useUpdateMyPresence`, two new `ReactFlow` props, two new sibling components) -- `onNodesChange`/`onEdgesChange`/`onConnect`/`onDelete` call sites are untouched.
14. `npm run build` / full gate -- PASS. See Mechanical gate above.

### Architecture invariants -- no violations found

- No long-running AI work anywhere in this diff (no `app/api` route touched at all).
- No metadata/blob storage concerns -- presence is fully ephemeral Liveblocks state, no Prisma/Blob code touched.
- No new mutation boundary introduced (Presence broadcast isn't a Storage/ownership-gated mutation), so no new auth surface to enforce.
- All new components (`presence-avatars.tsx`, `live-cursors.tsx`, `use-current-user-id.ts`) are correctly `"use client"` -- genuinely require browser-side Liveblocks/Clerk hooks and real-time state.
- Canvas schema (nodes/edges) untouched, consistent with the "must remain consistent between user-created content and imported templates" invariant -- this spec doesn't touch schema at all.

### Standards compliance -- spot-checked

- No `any` type usage in any of the 3 new/modified non-test source files (`hooks/use-current-user-id.ts`, `presence-avatars.tsx`, `live-cursors.tsx`) -- grepped and confirmed the one `any` match in `presence-avatars.tsx` is inside a comment ("any remainder"), not a type.
- No raw Tailwind palette classes (`zinc-`/`slate-`/`gray-`) or hardcoded hex colors in the new components -- grepped clean. `ring-border-subtle`/`bg-surface-border`/`text-copy-primary`/`bg-elevated`/`text-copy-secondary` all resolve to real tokens already defined in `app/globals.css` (`--border-subtle`, `--border-default` aliased as `surface-border`, `--text-primary`, `--bg-elevated`, `--text-secondary`). The one inline-style color (`--cursor-color` set from `other.info.color`, a genuine runtime value, not a static hardcode) correctly follows the established `--swatch-glow` (spec 15) pattern.
- `components/ui/avatar.tsx` -- genuinely shadcn-CLI shaped: `data-slot`/`cn()`/`@base-ui/react` primitive import matches the exact structure of every other file in `components/ui/` (compared directly against `button.tsx`), `components.json`'s `style: "base-nova"` matches the `@base-ui/react/avatar` import, and its semantic tokens (`bg-muted`, `text-muted-foreground`, `bg-primary`, `ring-background`) are pre-existing shadcn base tokens already wired to this project's dark theme values in `globals.css` (not introduced by this spec) -- no evidence of hand-editing beyond CLI generation.

### Error handling

- Clerk `useUser()` returning a null/undefined user (loading or signed-out) is handled -- `useCurrentUserId()` returns `undefined`, and the filter (`other.id !== currentUserId`) degrades to "no exclusion" rather than throwing; acceptable for this ephemeral, non-critical UI (worst case during a brief loading window is a stale/duplicate avatar, not a crash or data-integrity issue) -- not explicitly covered by a dedicated test, but not a spec-mandated failure mode either.
- Missing/broken avatar image: delegated to shadcn's `AvatarFallback`, which is designed to activate correctly on both an empty `src` and an image load failure (Open Questions #4 in the Brief) -- appropriate use of the library's own built-in behavior rather than a hand-rolled check.
- Null cursor (participant present but not currently moving their mouse, or just left the pane): explicitly checked and renders nothing (`if (other.id === currentUserId || other.cursor === null) return null`), tested directly.

### Housekeeping

[Minor, non-blocking] `context/progress-tracker.md` has no "Completed" entry for spec 19 -- it still reads "Phase 19 -- not yet started" / "Current Goal: Analyst pass for feature spec 19." `git diff spec/18-starter-template -- context/progress-tracker.md` is empty. Noting this because it's an explicit QA checklist item, but per this pipeline's actual established convention (confirmed via `git log`: spec 18's "Completed" entry landed in a separate follow-up commit, `51fbdf6 docs: record spec 18's PR #12 in progress-tracker.md`, after PR review -- not inline with the Dev implementation commit, and spec 18's own QA bugfix round explicitly excluded this same item from Dev's scope for exactly this reason), this is expected to be filled in via a similar follow-up commit once this spec clears PO review, not a defect in the implementation itself. Not treated as a PASS-blocking issue for that reason, but flagged so it isn't dropped before the follow-up commit happens.

### Handoff

QA passed -- ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Product fit against `project-overview.md`

This spec directly strengthens **Success Criterion 2** ("Multiple users can collaborate in the same canvas simultaneously") — the single criterion this spec exists to serve. Before this spec, the room-connection/Storage-sync mechanism (spec 11) was wired but invisible: a user in a shared room had no way to see who else was there or where anyone else's pointer was. After this spec, a signed-in user sees a real top-right collaborator avatar stack (photo or initials, capped at 5 with a `+N` overflow, a divider only when warranted) alongside their own existing Clerk `UserButton`, and sees other participants' live cursors move across the canvas with a name badge in that participant's own presence color. That is the literal, felt experience of "collaborating simultaneously" — this spec turns an already-shared data layer into a visible, legible one. I read the actual `presence-avatars.tsx` and `live-cursors.tsx` source directly, not just Dev's description of them, and confirmed the rendered behavior matches what's claimed (self-exclusion via Clerk ID including the same-account-second-tab case, divider logic, 5-avatar cap with overflow chip, flow-space cursor coordinate storage/conversion via `screenToFlowPosition`/`flowToScreenPosition`, color sourced from `other.info.color` rather than recomputed client-side).

No other Success Criterion is touched, weakened, or put at risk. This is a pure additive overlay on top of the existing Liveblocks room connection — it introduces no new `app/api` route, no Prisma/Blob change, and (independently confirmed via `git diff spec/18-starter-template`) zero changes to `canvas-node.tsx`, `canvas-edge.tsx`, `shape-visual.tsx`, `node-color-toolbar.tsx`, `editor-navbar.tsx`, or `workspace-navbar.tsx` — the node/edge rendering and mutation paths that Criteria 2 (in its "editing" sense) and the starter-template import (Criterion 3) both depend on are untouched.

### Independent scope/diff verification (not trusting Dev/QA claims alone)

- `git diff spec/18-starter-template --stat`: 11 files changed, exactly matching Dev Notes' "Files added"/"Files modified" lists — `hooks/use-current-user-id.ts` (+test), `components/editor/presence-avatars.tsx` (+test), `components/editor/live-cursors.tsx` (+test), `components/ui/avatar.tsx` (new, CLI-generated), `components/editor/canvas.tsx` + its test, `context/ui-context.md`, this status file. No files outside that list.
- `git diff spec/18-starter-template -- components/editor/editor-navbar.tsx components/editor/workspace-navbar.tsx components/editor/canvas-node.tsx components/editor/canvas-edge.tsx components/editor/shape-visual.tsx components/editor/node-color-toolbar.tsx`: **0 lines**, confirming all six protected files are genuinely byte-for-byte untouched — I ran this myself rather than trusting QA's account of it.
- Read the full `git diff` of `components/editor/canvas.tsx`: confirmed the change is additive only — `useUpdateMyPresence()`, `flowToScreenPosition` destructured alongside the pre-existing `screenToFlowPosition`, two new named `ReactFlow` props (`onPaneMouseMove`/`onPaneMouseLeave`), and `<PresenceAvatars />`/`<LiveCursors />` rendered as new siblings of the existing `<ReactFlow>`/`ShapePanel`/`CanvasControlBar`/`StarterTemplatesModal` tree. No changes to `onNodesChange`/`onEdgesChange`/`onConnect`/`onDelete`/`handleImportTemplate`/`defaultEdgeOptions`/node or edge type maps.
- Read `presence-avatars.tsx` and `live-cursors.tsx` in full: self-exclusion is genuinely by Clerk ID (`hooks/use-current-user-id.ts`, wrapping `useUser()` from `@clerk/nextjs`, not `useSelf()`), the divider only renders when `collaborators.length > 0`, `MAX_VISIBLE_COLLABORATORS = 5` with a `+N` chip for the remainder, `AVATAR_SIZE_CLASS = "h-8 w-8"` applied identically to both the collaborator `Avatar` and `UserButton`'s `appearance` prop, no `onClick`/`href`/interactive affordance anywhere in the collaborator stack. `LiveCursors` uses `useOthersConnectionIds()` + per-connection `useOther()` with a `shallow` comparator, filters the current user out (including same-account second connection), and renders nothing when `cursor === null`.
- Read `liveblocks.config.ts` directly: `Presence` (`cursor: {x,y}|null`, `thinking: boolean`) and `UserMeta.info` (`name`, `avatar`, `color`) already match this spec's required shape with zero diff — correctly confirmed-not-modified.
- Confirmed `context/progress-tracker.md` diff is empty against `spec/18-starter-template`, consistent with this pipeline's established convention (spec 18's "Completed" entry landed in a follow-up commit after PO sign-off, not inline with Dev's implementation) — not treating QA's housekeeping note as a defect, per the task's explicit instruction.
- Read the `context/ui-context.md` diff: the new "Presence Avatars & Cursor" section documents the avatar-stack convention, cursor broadcast mechanism, flow-space coordinate decision, self-exclusion reasoning, and the `shallow`-selector performance pattern — consistent with the actual code, not aspirational.
- Ran `npx tsc --noEmit` myself as a spot-check: clean, no errors, corroborating QA's gate reproduction (I did not re-run the full eslint/vitest/build gate myself, trusting QA's independent reproduction of that per this review's normal scope).

### Scope check

No touches to any `project-overview.md` Out of Scope item (billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps) — nothing in this spec's diff comes near any of them. No touches to any of this spec's own Scope Limits either: the shared `EditorNavbar` is untouched (confirmed via empty diff, not just QA's claim), no existing `WorkspaceNavbar` action was removed, Clerk's `UserButton` is reused as-is (only a size-only `appearance` override), collaborator avatars are genuinely non-interactive (no click/hover-card/href, confirmed by reading the code and by the passing "no interactive affordances" test), and canvas node/edge rendering/mutation is untouched. The `thinking` Presence field is confirmed present in the type but has no UI built for it here, correctly deferred to spec 24 per `architecture-context.md`'s own cross-reference.

### `progress-tracker.md` accuracy

Confirmed untouched by this diff. Per this task's explicit instruction and this pipeline's established convention (spec 18 precedent), the "Completed" entry is not expected inline with Dev's implementation — it lands in a follow-up commit after this sign-off. Not a gap in the current record.

### Rough edges — acceptable at this stage

- No live two-tab/multiplayer browser verification was possible in this pipeline (consistent with every prior canvas spec, 11–18) — Dev Notes' own "Known limitations" section already flags this and recommends a human smoke test (two tabs, same-account second tab for self-exclusion, cursor tracking through pan/zoom, avatar overflow past 5 collaborators) before considering this fully proven. I agree this is a reasonable deferral, not a blocker, on the same footing every prior canvas spec has been judged.
- `useViewport()`'s re-render-on-every-pan/zoom-frame cost versus the reference implementation's imperative-DOM approach is unbenchmarked — flagged honestly by Dev as an assumption, not a measured fact. Given `LiveCursors` only mounts a handful of children per room, this is very unlikely to be a real problem at this stage, and does not block later specs.
- No custom tooltip/hover card beyond the native `title` attribute on collaborator avatars — correctly scoped as a Dev-level nicety, not a requirement.

None of these would block a later spec from building on this one correctly — `PresenceAvatars`/`LiveCursors` are self-contained overlay components with no exported interface a later spec depends on, and `CanvasFlow`'s public shape (`useLiveblocksFlow`'s returned `nodes`/`edges`/`onNodesChange`/`onEdgesChange`/`onDelete`) is unchanged.

### Conclusion

All 14 numbered acceptance criteria hold up under my own independent re-verification (diff scope, source reading, a live `tsc` spot-check), not just trust in the Dev Notes/QA Report. This spec is a direct, meaningful step on Success Criterion 2, introduces no Out-of-Scope surface, and leaves every protected rendering/navbar file genuinely untouched. `progress-tracker.md` remains correctly unmodified pending this sign-off, consistent with the established convention.

## Handoff

Product Owner PASS — ready for human review.
