Source spec: `context/feature-specs/29-spec-ui-integration.md`

## Analyst Brief

### Scope statement

Wire the existing, static AI sidebar Specs tab (`components/editor/specs-tab.tsx`, spec 20) up to spec 28's already-shipped read APIs: a real, fetched spec list, a Markdown preview modal opened on click, and a download action on both the list item and the modal. Frontend-only — this spec consumes existing endpoints and adds no new backend logic, no new persistence, and no change to how a spec is generated.

### Concrete deliverables

- `components/editor/specs-tab.tsx` (rewritten) — replaces the spec-20 static demo card with a real fetch of `GET /api/projects/[projectId]/specs` (spec 28), rendered as a compact, scrollable list (shadcn `ScrollArea`) of `{ filename, createdAt }` items. The existing "Generate Spec" button stays in place, visually unchanged (see Open Questions #1 for whether/how it gets wired). Needs a `projectId` prop it does not currently receive — see the `ai-sidebar.tsx` bullet below.
- `components/editor/spec-preview-modal.tsx` (new) — a shadcn `Dialog`-based modal (same `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` primitives `starter-templates-modal.tsx`/`share-dialog.tsx` already use), opened when a spec list item is clicked. Fetches the spec's Markdown content, renders it as formatted Markdown (not a raw `<pre>` dump — see Open Questions #2), and exposes a download action alongside the existing close button. Close/Escape/focus-trap come for free from `components/ui/dialog.tsx`'s underlying `@base-ui/react` `Dialog` primitive — no extra keyboard-handling code needed to satisfy "basic keyboard support."
- `components/editor/ai-sidebar.tsx` (modified, minimal) — thread the `projectId` prop it already receives (for `AiArchitectTab`, spec 26) straight through to `<SpecsTab projectId={projectId} />` as well. No new state owned here, matching this file's existing "forward straight through" posture for every other prop.
- `hooks/use-project-specs.ts` (new, optional but recommended) — a plain fetch-and-`useState` hook for the list (`{ specs, isLoading, error, refetch }`), per `architecture-context.md`'s "new client-side hooks go in `hooks/`" convention. This is component-local state management, not the "new global state" the Scope Limits forbid — no Context/Zustand/module-level singleton. A Senior Developer may instead inline the fetch directly in `SpecsTab` if that's judged simpler; either is acceptable as long as no global state mechanism is introduced.
- `package.json`/`package-lock.json` (likely modified) — a Markdown-rendering dependency (e.g. `react-markdown`) is very likely needed; none currently exists in this codebase (confirmed via direct `package.json` inspection). See Open Questions #2.
- No changes anywhere in this diff to `app/api/**`, `trigger/**`, `lib/spec-blob.ts`, or `prisma/schema.prisma` — the raw spec text's own explicit Scope Limit ("do not implement backend logic").

### Acceptance criteria

1. The Specs tab fetches the spec list for the current project from `GET /api/projects/[projectId]/specs` and displays, per item, its `filename` and `createdAt`.
2. The list renders as a compact, scrollable region (shadcn `ScrollArea`) inside the existing sidebar shell — the sidebar's own header/tabs/positioning (`ai-sidebar.tsx`) are visually unchanged; only `SpecsTab`'s internal content changes.
3. Clicking a spec list item opens a preview modal.
4. The modal fetches the spec's Markdown content through an existing endpoint — not a direct client-side Vercel Blob request — and renders it as formatted Markdown (headings, lists, code blocks, etc. visually distinct from plain text), not an unrendered raw string.
5. The modal provides a close action and basic keyboard support (Escape dismisses the modal; focus is trapped while open).
6. A download action exists on each list item and inside the modal.
7. Triggering a download action calls `GET /api/projects/[projectId]/specs/[specId]/download` and lets the browser handle the resulting file save (e.g. a real `<a href download>` navigation to that URL) — the client never constructs its own Blob URL or reads `ProjectSpec.filePath` directly.
8. Fetched spec Markdown is not retained in any long-lived/top-level frontend state — it's held only for the currently-open preview modal and discarded (or left to go stale/unreferenced) on close, not cached in a persistent store.
9. No file under `app/api/**`, `trigger/**`, or `prisma/schema.prisma` is touched anywhere in this diff.
10. No new global state mechanism (React Context, a new provider, a module-level store) is introduced; all new state is local to `SpecsTab`/`SpecPreviewModal` (or a plain fetch-only hook).
11. `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, and `npx next build` all pass.

### Dependencies

- **Spec 28 (Spec Persistence & Download)** — `GET /api/projects/[projectId]/specs` (list) and `GET /api/projects/[projectId]/specs/[specId]/download` (content), the two endpoints this spec's entire frontend is built on. **Complete** (QA PASS, Product Owner PASS, PR #25 open against `main`, not yet merged).
- **Spec 20 (AI Sidebar Shell)** — `components/editor/specs-tab.tsx`'s existing placeholder structure and `ai-sidebar.tsx`'s tab shell, which this spec rewrites the inside of without redesigning. **Complete.**
- **Spec 26 (Design Agent Frontend)** — precedent for `projectId` already being threaded into `AiSidebar` and for the "component owns its own fetch + local state, no new Context" pattern this spec should follow for the Specs tab. **Complete.**
- **`components/ui/dialog.tsx`, `components/ui/scroll-area.tsx`, `components/ui/button.tsx`** — existing shadcn primitives (`@base-ui/react`-backed), reused as-is per Protected Foundation Components rules. **Complete, pre-existing.**

### Open questions

1. **Does this spec also wire the existing inert "Generate Spec" button (trigger a new run via `POST /api/ai/spec` + `POST /api/ai/spec/token` + `useRealtimeRun`, then refresh the list on completion), or does it stay exactly as spec 20 left it (visually present, no handler)?**
   The raw spec text's own three numbered "Implementation" items (spec list, preview modal, download action) and its "Check When Done" checklist never mention the Generate button or triggering generation — only viewing/previewing/downloading specs that already exist. Against that: `architecture-context.md`'s "Realtime Conventions" section explicitly says spec 27's run-metadata mechanism exists "so a future spec wiring up the frontend (**spec 29**) doesn't have to re-derive this" — a forward-reference written specifically anticipating this spec would do that wiring. Spec 29 is also the last spec currently defined in `context/feature-specs/` — with no button wiring, there is no UI path that ever produces a `ProjectSpec` row, so the list/preview/download work this spec delivers would only ever be exercised by specs created out-of-band (e.g. a developer calling `POST /api/ai/spec` manually).
   **Recommendation: treat button-wiring as out of scope for this pass**, strictly matching the raw spec text's own literal numbered items and Scope Limits (which name "backend logic," not frontend triggers, but also never ask for this) — consistent with this pipeline's established conservative-scoping precedent (e.g. spec 27 deliberately left persistence to spec 28 despite being immediately adjacent work). The Generate button stays inert, unchanged from spec 20. This should be called out explicitly to the Product Owner as a real, visible gap — the full "generate → view" user loop is not closed by the feature-spec pipeline as currently defined — rather than silently left for a human to notice later. If the Senior Developer or Product Owner judges the architecture-context.md forward-reference decisive enough to include the wiring anyway, that is a legitimate alternate call, but it should be made explicitly and flagged in Dev Notes, not treated as this brief's default.

2. **Reusing the download route for the modal's content fetch, vs. a new content endpoint.** Spec 28's download route responds with `Content-Type: text/markdown` and `Content-Disposition: attachment; filename=...`. That header only changes browser behavior on a *direct navigation* (an `<a>` click/`window.location` assignment) — a plain `fetch()` call (as the preview modal needs, to get the Markdown text into React state for rendering) ignores `Content-Disposition` entirely and just returns the response body as text. **Recommendation: reuse the existing download route for both** — the preview modal calls it via `fetch(...).then(r => r.text())` to get content for rendering, while the separate "download" action(s) point a real `<a href={downloadUrl} download>` (or equivalent native-navigation trigger) at the *same* URL so the browser's native save-as behavior fires there instead. Same route, two different client-side invocation mechanisms — no new endpoint, no backend change, and directly satisfies both "fetch the spec content through an existing endpoint" and "do not access Blob directly."

3. **Markdown rendering approach.** No Markdown-rendering library exists in this codebase today (confirmed via `package.json`). The raw spec text explicitly says "render content as Markdown," which a plain `<pre>{markdown}</pre>` would not genuinely satisfy (no headings/lists/code-block formatting). **Recommendation: add a small, standard dependency (e.g. `react-markdown`)** as a genuine, flagged new production dependency — the same posture specs 25 (`zod`) and 26 (`@trigger.dev/react-hooks`) already took when a spec's own explicit text required a capability nothing installed could provide. A hand-rolled minimal Markdown-to-JSX renderer is a viable alternative if the Senior Developer prefers avoiding a new dependency, but should be a documented, deliberate choice either way, not an accidental `<pre>` fallback.

4. **The narrow race window QA flagged in spec 28** (a spec's placeholder `ProjectSpec` row briefly has an empty `filePath` between its two-write persist steps; a list/download call during that window could show a broken entry or 500). Since this spec's Scope Limits forbid backend changes, the underlying race cannot be fixed here. **Recommendation:** handle it defensively client-side only — if a preview/download fetch for a given spec fails, show a small inline error state in the modal (or a disabled/errored list item) rather than an unhandled crash. This is not a required acceptance criterion (the raw spec text doesn't mention it), just a recommended resilience measure given the known, pre-flagged gap.

If any of the above resolve differently than recommended, that should be recorded explicitly in Dev Notes rather than left implicit.

### Out-of-scope callouts

- **Wiring the "Generate Spec" button / triggering a new spec-generation run from this UI** — not named in the raw spec text's numbered implementation items or Check When Done checklist; see Open Questions #1. Excluded from this brief's default scope, flagged as a real gap for Product Owner visibility rather than silently pulled in.
- **Any change to `app/api/**`, `trigger/generate-spec.ts`, `lib/spec-blob.ts`, or `prisma/schema.prisma`** — the raw spec text's own explicit Scope Limit ("do not implement backend logic").
- **Direct client-side Vercel Blob access (reading `ProjectSpec.filePath`, calling Blob URLs from the browser)** — explicit Scope Limit; every read goes through the existing access-checked API routes.
- **Long-term/persistent frontend storage of spec content** (e.g. caching fetched Markdown in a store that outlives the modal) — explicit Scope Limit; content is fetched per view.
- **Redesigning the AI sidebar or its tab structure** — explicit Scope Limit; only `SpecsTab`'s internal content changes, `ai-sidebar.tsx`'s header/tabs/positioning stay as spec 20 built them (plus the one-line `projectId` prop thread-through).
- **New global state (Context, store, provider)** — explicit Scope Limit; list/modal state stays component-local, matching every other "push state up via a callback, no new Context" precedent already established in this codebase (specs 18/21/24/25/26).
- **Versioned spec history, diffing, or review/approval workflows** — `project-overview.md`'s Out of Scope wall. Rendering an already-generated spec's own content is not the same as history/versioning.
- **Rate limiting, billing/subscriptions, enterprise permission tiers, production object storage migration, mobile apps** — `project-overview.md`'s Out of Scope wall; none of this spec's work touches any of them.

Brief ready for Senior Developer at `context/spec-status/29-spec-ui-integration.md`.

## Dev Notes

### Files added/changed

- `hooks/use-project-specs.ts` (new) — `useProjectSpecs(projectId)`: fetches `GET /api/projects/[projectId]/specs` (spec 28) on mount and exposes `{ specs, isLoading, error, refetch }`. Plain fetch-and-`useState` hook, component-local state only — no Context, no module-level store.
- `hooks/use-project-specs.test.ts` (new) — mount fetch, error (non-OK response and thrown/network failure), `refetch`, and `projectId`-change re-fetch coverage.
- `components/editor/spec-preview-modal.tsx` (new) — `SpecPreviewModal`, a shadcn `Dialog` (same primitives `starter-templates-modal.tsx`/`share-dialog.tsx` use) that opens when a non-null `spec` prop is passed in, fetches that spec's Markdown via `fetch()` against the existing download route, and renders it through `react-markdown` with a small manual `components` mapping (headings/paragraphs/lists/links/code/pre) onto this app's own `text-copy-*`/`bg-subtle`/`border-surface-border` tokens — no `@tailwindcss/typography` plugin exists in this codebase, so this is a deliberate, minimal token-based mapping rather than pulling in a second styling dependency. Provides a real `<a href download>` download action pointed at the same download URL the preview itself fetched (Open Questions #2's recommended resolution — one route, two client-side invocation mechanisms).
- `components/editor/spec-preview-modal.test.tsx` (new) — closed-state (no fetch), successful fetch renders real Markdown (asserts an actual `<h1>` element, not a string match on raw text), loading state, both failure modes (non-OK response and a thrown/network error) each show an inline error rather than crashing, the download link's `href`/`download` attributes, the dialog title, and the dialog's own close control calling `onOpenChange(false)`.
- `components/editor/specs-tab.tsx` (rewritten) — replaces spec 20's static demo card with `useProjectSpecs`-backed real data: loading/error(+Retry)/empty states, then a shadcn `ScrollArea`-scrollable list of items (`filename` + formatted `createdAt`), each clickable to open `SpecPreviewModal` and each carrying its own `<a href download>` download action. The "Generate Spec" button is untouched — present, enabled-looking, no handler (see Open Questions #1 below).
- `components/editor/specs-tab.test.tsx` (rewritten) — Generate Spec button still present/enabled, list fetch called with the right `projectId`, loading → populated-list rendering, empty state, error+Retry state, click-to-open-modal (asserts the modal's own content fetch fires), one download link per item with the right `href`/`download`, and the existing no-raw-color-classes token check.
- `components/editor/ai-sidebar.tsx` (modified, minimal) — threads the already-received `projectId` prop straight through to `<SpecsTab projectId={projectId} />`; no new state owned here. Also widened the "specs" `TabsContent`'s className from `flex-1 overflow-y-auto` to `flex flex-1 flex-col overflow-hidden` (matching the "architect" `TabsContent`'s own existing className exactly) — needed so `SpecsTab`'s internal `ScrollArea` gets a real, bounded flex height to scroll within, rather than relying on an ancestor's `overflow-y-auto` against an undefined-height block child. This is the only structural change in this file; the sidebar's header/tab triggers/positioning are untouched.
- `package.json`/`package-lock.json` (modified) — added `react-markdown@^10.1.0` as a new production dependency (confirmed via `npm view` that its peer range accepts React 19). No other dependency changes.
- No file under `app/api/**`, `trigger/**`, `lib/spec-blob.ts`, or `prisma/schema.prisma` touched anywhere in this diff.

### Skills used

- None from `.claude/skills/` applied directly — this spec is frontend-only React/Tailwind work consuming already-shipped API routes; no Clerk/Prisma/Liveblocks-specific mechanism was touched. (Checked the skills list per the standing instruction; nothing matched.)

### Key decisions

- **Open Questions #1 (Generate Spec button wiring): left out of scope**, per the brief's own recommendation. The button remains visually present and enabled-looking with no click handler — clicking it does nothing. This is a real, visible gap: as of this spec, there is still no UI path that produces a new `ProjectSpec` row; the list/preview/download work here is only exercisable against specs created out-of-band (e.g. a developer calling `POST /api/ai/spec` directly, as spec 28's QA/PO passes did). Flagging this explicitly for QA/Product Owner visibility, not silently leaving it for a human to notice.
- **Open Questions #2 (reuse download route for both preview-fetch and download-action): implemented as recommended.** The modal's preview calls `fetch(...).then(r => r.text())` against `GET /api/projects/[projectId]/specs/[specId]/download`; the modal's own download button and each list item's download action are real `<a href={downloadUrl} download>` elements pointed at that exact same URL. No new endpoint, no Blob URL ever read or constructed client-side.
- **Open Questions #3 (Markdown rendering): added `react-markdown` as recommended**, rather than a hand-rolled renderer or a raw `<pre>` dump. Styled via a small manual `components` override object using this app's own existing tokens (no `@tailwindcss/typography` plugin — none was installed, and adding a whole plugin for one modal's styling felt like more surface area than the small, explicit per-element mapping actually written).
- **Open Questions #4 (spec 28's persist-race defensive handling): implemented as recommended.** Both the modal's own content fetch and `useProjectSpecs`' list fetch treat a non-OK response as a recoverable, inline error state (a message in the modal, or a "Retry" button in the tab) rather than an unhandled crash — not a fix for the underlying race (out of this spec's Scope Limits, no backend touched), just client-side resilience against it.
- **Auto-fetch-on-mount without tripping `react-hooks/set-state-in-effect`**: both `useProjectSpecs` and `SpecPreviewModal` needed a fetch to start automatically (on hook mount / on `spec` becoming non-null) rather than being triggered from a click, unlike `hooks/use-collaborators.ts`'s deliberately click-triggered design (see that file's own doc comment on why an eager top-of-effect `setIsLoading(true)` gets flagged by that lint rule). Resolved by never calling a state setter synchronously as the first statement of an effect body: `useProjectSpecs` relies on `useState(true)`'s own initial value for the first load and only flips state after the `fetch` call's `await` (mirroring `components/editor/canvas.tsx`'s proven spec-21 initial-load effect shape); `refetch` sets `isLoading(true)` from what is, structurally, an event-handler-style callback, not an effect body. `SpecPreviewModal` avoids the need entirely by deriving `isLoading`/`markdown`/`error` from a single `{ specId, markdown, error }` state value tagged with the spec id it belongs to, rather than a separate boolean flag.
- **Content lifecycle**: `SpecPreviewModal` clears its own fetched-content state when the dialog closes (`handleOpenChange` calls `setContent(null)` before forwarding to the parent's `onOpenChange`) — a deliberate choice to actively discard rather than merely "leave to go stale," even though the brief's Open Questions text says either is acceptable (acceptance criterion 8).

### Test coverage added

- `hooks/use-project-specs.test.ts` (new, 5 tests)
- `components/editor/spec-preview-modal.test.tsx` (new, 8 tests)
- `components/editor/specs-tab.test.tsx` (rewritten, 8 tests, up from 3)
- `components/editor/ai-sidebar.test.tsx` — unchanged; its existing Specs-tab-switch test still passes unmodified against the new real `SpecsTab` (that file's global `fetch` stub already resolves `{ ok: false }`, which `SpecsTab` now handles as a graceful inline error state rather than a crash).

Commands run (all clean):
- `npx tsc --noEmit` — clean, no errors.
- `npx eslint .` — clean on every file this diff touches (pre-existing errors/warnings remain only in generated `.trigger/tmp/build-*` build artifacts, unrelated to and untouched by this diff, consistent with prior specs' precedent); also independently re-ran `npx eslint` scoped to just this diff's files for a clean confirmation.
- `npx vitest run --no-file-parallelism` — 602/602 tests passing across 63 files (up from 584/61 at the end of spec 28).
- `npx next build` — succeeds; `GET /api/projects/[projectId]/specs` and the download route both still list correctly in the build's route summary (unchanged, since no `app/api/**` file was touched).

### Known limitations / deliberate deferrals

- The "Generate Spec" button remains fully inert (Open Questions #1 above) — no UI path in this codebase yet triggers a new spec-generation run. Recommended for explicit Product Owner visibility as a real, user-facing gap in the "generate → view" loop, not a silent omission.
- No live browser/manual smoke test of this spec's UI was possible in this pipeline (consistent with every prior frontend spec, 18–27) — recommended as a human smoke test once a real `ProjectSpec` row exists (e.g. via spec 28's own already-verified live Blob/Trigger.dev path, or a manual `POST /api/ai/spec` call) to visually confirm the Markdown rendering, scroll behavior, and real file downloads in an actual browser before this is considered fully proven end to end.
- `react-markdown`'s default behavior (no `remark-gfm` plugin) does not render GitHub-flavored tables or task-list checkboxes as tables/checkboxes — they'd fall back to plain text/paragraphs. Not added since neither the raw spec text nor the brief calls for table support specifically, and `generate-spec-ai.ts`'s (spec 27) own prompt doesn't request Markdown tables in its output; flagging in case a future spec's generated Markdown starts using GFM syntax.

Implementation ready for QA at `context/spec-status/29-spec-ui-integration.md`.

## QA Report

**Verdict: PASS**

### Mechanical gate (independently reproduced, not trusted from the Dev report)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Clean, no errors. |
| `npx eslint .` | Repo-wide run surfaces 53 errors/1339 warnings, but every one is confined to generated `.trigger/tmp/build-*/*.mjs` build artifacts (confirmed via `git diff main...spec/29-spec-ui-integration --stat -- .trigger` -- empty, this directory isn't part of the diff at all). Re-ran `npx eslint` scoped to just this diff's own files (`components/editor/spec-preview-modal.tsx`, `spec-preview-modal.test.tsx`, `specs-tab.tsx`, `specs-tab.test.tsx`, `ai-sidebar.tsx`, `hooks/use-project-specs.ts`, `use-project-specs.test.ts`) -- zero output, clean. |
| `npx vitest run --no-file-parallelism` | 602/602 passing across 63 files -- matches the Dev's reported count exactly (up from 584/61 at the end of spec 28). |
| `npx next build` | Succeeds. Route manifest unchanged from spec 28 (`/api/projects/[projectId]/specs` and the `/download` route both still list correctly), consistent with no `app/api/**` file being touched. |

### Acceptance criteria checklist (against the Analyst Brief's numbered list, context/spec-status/29-spec-ui-integration.md)

1. **PASS** -- hooks/use-project-specs.ts's useProjectSpecs fetches GET /api/projects/${projectId}/specs on mount; specs-tab.tsx renders spec.filename and a formatted spec.createdAt (formatCreatedAt) per list item. Verified in code and by specs-tab.test.tsx's "renders one item per fetched spec with its filename and createdAt" test.
2. **PASS** -- list renders inside a shadcn ScrollArea (components/editor/specs-tab.tsx), scoped to SpecsTab's own content. ai-sidebar.tsx's header/tab triggers/positioning are unchanged; the only structural edit in that file is the "specs" TabsContent's className (flex-1 overflow-y-auto -> flex flex-1 flex-col overflow-hidden, matching the already-existing "architect" TabsContent's own className exactly) plus the projectId prop thread-through. This is a bounded-height fix needed for ScrollArea to actually scroll, not a redesign -- confirmed via git diff main...spec/29-spec-ui-integration -- components/editor/ai-sidebar.tsx.
3. **PASS** -- each list item is a button onClick={() => setPreviewSpec(spec)}; SpecPreviewModal's open prop is spec !== null. Verified by specs-tab.test.tsx's "opens the preview modal when a list item is clicked" test.
4. **PASS** -- SpecPreviewModal fetches GET /api/projects/${projectId}/specs/${specId}/download via plain fetch() (not a direct Blob request), and renders the result through react-markdown with a manual, token-based components mapping (headings/paragraphs/lists/links/code/pre). spec-preview-modal.test.tsx asserts an actual h1 element renders from "# Hello" input, not a raw-text string match -- genuinely confirms formatted rendering, not a pre dump.
5. **PASS** -- close action: shadcn Dialog's built-in close button (components/ui/dialog.tsx, untouched) plus SpecPreviewModal's own a-href-download action don't interfere with it. Keyboard support: confirmed at the primitive level -- node_modules/@base-ui/react/dialog/root/DialogRoot.d.ts lists escapeKey as one of the built-in DialogRootChangeEventReason values with no disableEscapeKeyDown-style prop passed anywhere in dialog.tsx or spec-preview-modal.tsx to suppress it, and modal defaults to true (focus trap + scroll lock) since neither file overrides it. This matches established codebase precedent of not writing an explicit Escape-keypress test for shadcn Dialog-based modals (share-dialog.test.tsx exercises the same onOpenChange path via the close-button click instead, per that file's own comment) -- spec-preview-modal.test.tsx's "calls onOpenChange when the dialog's own close control is used" test follows the same house style.
6. **PASS** -- every list item (specs-tab.tsx) and the modal itself (spec-preview-modal.tsx) each render a real a-href-download download action.
7. **PASS** -- both download actions point at /api/projects/${projectId}/specs/${specId}/download as a real anchor navigation (download attribute present, confirmed via toHaveAttribute("download") in both test files); no client-side Blob URL is ever constructed and ProjectSpec.filePath is never read client-side (confirmed by reading app/api/projects/[projectId]/specs/route.ts, which only ever returns a derived filename, never filePath).
8. **PASS** -- SpecPreviewModal's fetched Markdown lives in a single local content state value, actively cleared (setContent(null)) in handleOpenChange when the dialog closes -- not cached in any persistent/top-level store.
9. **PASS** -- confirmed via git diff main...spec/29-spec-ui-integration -- app/api trigger prisma lib/spec-blob.ts (empty output) that no file under those paths appears anywhere in this diff.
10. **PASS** -- useProjectSpecs is a plain fetch-and-useState hook; SpecsTab/SpecPreviewModal state is component-local (useState only). No React.createContext, provider, or module-level store anywhere in the diff (grepped directly).
11. **PASS** -- see Mechanical gate table above; independently reproduced, not taken on the Dev's word.

### Architecture invariants (context/architecture-context.md)

- Invariant 1 (no long-lived AI work in request handlers) -- N/A to this diff; no route handler was touched or added.
- Invariant 2 (metadata vs. artifact storage separation) -- respected; this diff never reads ProjectSpec.filePath or a Blob URL client-side, only the access-checked download route's returned Markdown content and the list route's derived metadata.
- Invariant 3 (auth/ownership enforced at every mutation) -- N/A; this spec adds no mutations, and both endpoints it reuses (spec 28) already gate on getProjectAccess before any read.
- Invariant 4 (client components only where interactivity/real-time state requires) -- "use client" is present on all three new/changed files (use-project-specs.ts, spec-preview-modal.tsx, specs-tab.tsx); all three genuinely need hooks/fetch/click-handling, consistent with the invariant.

### Standards compliance (context/code-standards.md)

- No "any" in any changed file (grepped hooks/use-project-specs.ts, components/editor/spec-preview-modal.tsx, components/editor/specs-tab.tsx directly).
- No raw Tailwind color classes (zinc-/slate-/gray-) or hex literals in any changed file (grepped spec-preview-modal.tsx, specs-tab.tsx, ai-sidebar.tsx, use-project-specs.ts directly -- the one "gray" substring hit was translate-x-full, a false positive, not a color class).
- components/ui/* untouched (confirmed via git diff main...spec/29-spec-ui-integration -- components/ui -- empty), matching Protected Foundation Components rules; the brief didn't call for changes there.
- Border radius scale respected: rounded-3xl on DialogContent's override, rounded-2xl on the list items/ScrollArea border, rounded-xl on the small filename icon chip.
- interface used for ProjectSpecSummary/SpecsListResponse/SpecContentState/SpecPreviewModalProps/SpecsTabProps, matching the "use interface for object contracts" rule.
- New hook correctly placed at top-level hooks/ per architecture-context.md's Hooks Convention.

### Error handling

- List fetch failure (non-OK response or thrown/network error) -> useProjectSpecs sets an inline error + the tab renders a "Retry" button, not a crash. Covered by use-project-specs.test.ts and specs-tab.test.tsx.
- Modal content fetch failure (non-OK response or thrown/network error) -> inline error text in the modal body, not a crash. This is exactly spec 28 QA's flagged empty-filePath persistence race window's defensive handling (Open Questions #4): traced fetchSpecMarkdown/the download route's behavior for an invalid/empty filePath -- either a null result (-> 404) or a thrown Blob error (-> 500) -- both map to !response.ok in the modal's fetch, which is handled gracefully. Covered by spec-preview-modal.test.tsx's two failure-mode tests.
- Unauthorized/not-found access to the underlying spec routes (401/403/404) already handled server-side by spec 28's routes (unchanged here) and surfaces client-side as the same generic inline-error paths above.

### Housekeeping

- context/progress-tracker.md updated: Current Phase/Current Goal/In Progress/Next Up sections all correctly reflect that spec 29's Dev implementation is complete and QA was pending, with an accurate one-paragraph summary of what was actually built. Confirmed via git diff main...spec/29-spec-ui-integration -- context/progress-tracker.md.

### Minor observations (non-blocking, not filed as issues)

- If a spec's fetched Markdown content is a genuinely empty string (as opposed to an error), the modal renders nothing visible with no explicit "empty content" messaging. Not required by the raw spec text or acceptance criteria, and not a realistic case given generate-spec.ts's own AI output -- noted for awareness only, not filed as a bug.
- No dedicated fireEvent.keyDown(..., { key: "Escape" }) test exists for the modal. This matches established codebase precedent (share-dialog.test.tsx also relies on the close-button click as a proxy for the same onOpenChange path, per that file's own comment) rather than being a gap unique to this spec -- not filed as a bug.

### Issues found

None. No [Bug -> Dev] or [Spec gap -> Analyst] items to report.

QA passed -- ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Scope and diff verification (independent, not trusted from Dev/QA reports)

Reproduced `git diff main...spec/29-spec-ui-integration --stat` directly: 11 files changed — `components/editor/ai-sidebar.tsx`, `components/editor/spec-preview-modal.tsx` (new) + its test, `components/editor/specs-tab.tsx` (rewritten) + its test, `hooks/use-project-specs.ts` (new) + its test, `package.json`/`package-lock.json`, `context/progress-tracker.md`, and this spec-status file. Confirmed no `app/api/**`, `trigger/**`, `lib/spec-blob.ts`, or `prisma/schema.prisma` file appears anywhere in the diff (the file list above is exhaustive — nothing under those paths is present). No `components/ui/*` file was touched either, consistent with Protected Foundation Components.

Read the actual bodies of `hooks/use-project-specs.ts`, `components/editor/spec-preview-modal.tsx`, `components/editor/specs-tab.tsx`, and the `ai-sidebar.tsx` diff directly (not summarized from the reports):

- `useProjectSpecs` is a plain fetch-and-`useState` hook (`specs`/`isLoading`/`error`/`refetch`), no Context, no module-level store — genuinely component-local, matching the brief's Scope Limit.
- `SpecPreviewModal` fetches `GET /api/projects/[projectId]/specs/[specId]/download` via plain `fetch()`, never reads a Blob URL or `ProjectSpec.filePath` client-side, and renders through `react-markdown` with a real, token-based `components` mapping (`h1`-`h3`, `p`, `ul`/`ol`/`li`, `a`, `strong`, `blockquote`, `code`, `pre`) onto this app's own `text-copy-*`/`bg-subtle`/`border-surface-border` tokens — genuinely formatted output, not a `<pre>` dump. Content state (`SpecContentState`) is cleared on close (`handleOpenChange` calls `setContent(null)`), matching acceptance criterion 8 and the brief's Scope Limit against long-lived frontend storage.
- `specs-tab.tsx`'s list and modal's own action both use a real `<a href={.../download} download>` element pointed at spec 28's existing download route — no client-constructed Blob URL, no new endpoint.
- `ai-sidebar.tsx`'s only structural change is threading the already-received `projectId` prop into `<SpecsTab>` and widening the "specs" `TabsContent`'s className to match the already-existing "architect" tab's own className exactly (`flex-1 overflow-y-auto` -> `flex flex-1 flex-col overflow-hidden`) — a bounded-height fix `ScrollArea` needs, not a redesign. Header/tab triggers/positioning are untouched.
- `package.json` adds exactly one new production dependency, `react-markdown@^10.1.0` — a genuine, flagged addition for a genuine gap (no Markdown renderer existed in this codebase before), consistent with specs 25 (`zod`)/26 (`@trigger.dev/react-hooks`)'s own precedent for adding a small dependency only when the raw spec text's own requirement (here, "render content as Markdown") can't be met without one.

### Mechanical gate — independently re-reproduced, not taken on QA's word

- `npx tsc --noEmit` — clean.
- `npx eslint .` scoped to this diff's own seven changed/added files (`spec-preview-modal.tsx`/`.test.tsx`, `specs-tab.tsx`/`.test.tsx`, `ai-sidebar.tsx`, `use-project-specs.ts`/`.test.ts`) — zero output, clean.
- `npx vitest run --no-file-parallelism` — 602/602 passing across 63 files, matching QA's reported count exactly.

### Against `project-overview.md` Success Criteria

- **Success Criterion 5** ("The graph can be converted into a persisted Markdown spec") — spec 27 generates it, spec 28 persists it; this spec closes the "view/download" half of the Features section's own explicit line ("Users can view and download generated specs") by making both operations reachable from the actual UI a user would use, not just a direct API call. This is a genuine, substantive completion of that Features line — not a technicality — matching how this pipeline treated spec 26 closing the equivalent loop for AI architecture generation.
- **Success Criterion 6** ("Project metadata and generated artifacts are stored in the correct layers") — unaffected by this spec (no storage-layer change); correctly out of this spec's territory, already settled by spec 28.
- **Core User Flow step 10** ("User reviews or downloads the spec") — now genuinely reachable through the UI: click a spec in the sidebar list, modal opens, real Markdown renders, download from either the list item or the modal.
- No touches to any `project-overview.md` Out of Scope item (billing, enterprise tiers, versioned spec history, production object-storage migration, mobile). The spec list here is a flat, unversioned list of independently generated specs (spec 28's own design) — no diffing, no review/approval workflow, no version numbering anywhere in this diff.

### The "Generate Spec" button being left unwired — judged a legitimate, correctly-flagged scope boundary, not a blocker

This was the one substantive product question worth forming an independent view on, since the Analyst Brief itself flagged it as a live, not-silently-decided gap.

- The raw spec text (`context/feature-specs/29-spec-ui-integration.md`) is unambiguous on its own literal scope: its three numbered "Implementation" items (spec list, preview modal, download action) and its four-item "Check When Done" checklist never mention the Generate button or triggering a new run — only viewing/previewing/downloading specs that already exist. `ai-workflow-rules.md`'s own instruction ("Always implement against these specs — do not infer or invent behavior from scratch") makes this raw text the controlling authority for what spec 29 must deliver. Dev/QA following that literal text is the correct default, not a corner cut.
- I independently traced the Analyst Brief's specific textual claim that `architecture-context.md`'s Realtime Conventions section says spec 27's run-metadata mechanism exists "so a future spec wiring up the frontend (spec 29) doesn't have to re-derive this." Reading `architecture-context.md` directly (and `git show` on the commit that introduced its Realtime Conventions bullet, spec 27's `9ad547d`), that exact phrase is not there — `architecture-context.md`'s own bullet only explains why spec 27 chose Trigger.dev run-metadata over a Liveblocks broadcast ("`generate-spec` has no frontend wiring yet for a Liveblocks broadcast to reach anyway"), a spec-27-scoped technical justification, not a forward commitment. The quoted phrase actually lives in `context/progress-tracker.md`'s "Architecture Decisions" section instead (also written at spec 27's time): "...so a future spec wiring up the frontend (spec 29) doesn't have to re-derive this from scratch." That is a real, if secondary, forward-looking expectation on record — and arguably a more pointed one than the brief's misattributed citation, since nothing in a view/download-only scope would ever consume Trigger.dev's run-metadata mechanism at all, so the note only makes sense as an expectation that spec 29 would include triggering. This strengthens, rather than weakens, the case that some expectation existed for spec 29 to close the trigger loop. But it directly conflicts with the actual raw spec text at `context/feature-specs/29-spec-ui-integration.md`, which is what the Analyst is instructed to implement against, and that text unambiguously excludes button-wiring. Given that conflict, the Analyst's recommendation to treat this as out of scope for spec 29 — while flagging it loudly to the Product Owner, which it did — is the right call. The correct fix is a human decision to reconcile `progress-tracker.md`'s stale forward-reference and author the missing follow-up spec, not a re-scoping of spec 29's own already-correct implementation. Noting the citation mix-up here for pipeline-hygiene awareness; not routing back for it, since it does not change the scope call itself.
- The real, substantive point remains what the brief itself surfaced honestly: spec 29 is currently the last spec defined in `context/feature-specs/`, and with the Generate button inert, there is no UI path anywhere in this pipeline's currently-defined scope that produces a new `ProjectSpec` row — the full Core User Flow (steps 1-10, specifically step 8, "User triggers spec generation") cannot be exercised end-to-end by an actual user through the UI as of this spec, only by a developer calling `POST /api/ai/spec` directly (as spec 28's own QA/PO passes did).
- This is a real product gap, but it is a gap in *what specs have been defined so far*, not a defect in spec 29's own delivery against its own literal text. Spec 29 does exactly and only what its raw spec text and brief describe, does not cross any Out of Scope wall, and does not block any future spec from building correctly on top of it — wiring the button later is additive, not a rework of anything shipped here. Sending this back to the Analyst would not resolve anything, since the Analyst already correctly scoped spec 29 to its own raw text; the actual fix is a new feature spec (not yet written) that wires the button, which is outside this review's authority to create.
- **Recommendation to the human**: define a follow-up feature spec (spec 30 or later) that wires the "Generate Spec" button to `POST /api/ai/spec` + `POST /api/ai/spec/token` + `useRealtimeRun`, mirroring `ai-architect-tab.tsx`'s (spec 26) already-proven two-call submission pattern, so the full generate → persist → view → download loop becomes reachable from the UI end to end. Until that lands, this pipeline's "AI Architecture Generation" and "Spec Generation" feature areas are asymmetric: architecture generation is fully UI-triggerable (spec 26), spec generation is not. Also worth a quick human pass to correct `progress-tracker.md`'s spec-27-era forward-reference so it no longer reads as an unmet, undocumented commitment.

### Rough edges — acceptable at this stage, not a blocker for later specs

- No live browser/manual smoke test of the rendered Markdown, scroll behavior, or real file download was performed in this pipeline (consistent with every prior frontend spec, 18-27) — Dev's own "Known limitations" section already recommends this as a human smoke test once a real `ProjectSpec` row exists. Not a blocker; nothing about this spec's own contracts is left ambiguous by skipping it.
- `react-markdown` renders without `remark-gfm`, so GitHub-flavored tables/task lists would fall back to plain text if a future spec's generated Markdown ever used that syntax. Flagged by Dev, not currently exercised by `generate-spec-ai.ts`'s own prompt — a candidate follow-up only if that changes, not a current gap.
- An empty-string (not erroring) Markdown fetch renders nothing visible with no explicit "empty" messaging — noted by both Dev and QA as a non-issue given `generate-spec-ai.ts`'s own output shape; not filed as a bug.

### `progress-tracker.md` accuracy

The "In Progress" entry for spec 29 (as of this review) accurately reflects what was actually delivered: every file added/modified, the `react-markdown` dependency addition, the `projectId` thread-through, and the full mechanical gate passing — matching QA's own independently-reproduced diff and results, not an aspirational description. Moving this entry to "Completed" below as part of this review, with "Current Phase"/"Next Up" advanced past spec 29 — noting there, per the recommendation above, that no spec 30 (Generate Spec button wiring) currently exists in `context/feature-specs/` and one should be authored before the "generate → view" loop can be considered closed end to end.

Ready for the human's final call on whether to move forward — this verdict is a recommendation, not a deployment authorization.
