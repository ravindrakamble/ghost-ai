# Spec 20: AI Sidebar Shell

Source: `context/feature-specs/20-ai-sidebar-shell.md`

## Analyst Brief

### Scope statement

Replace the static `AiSidebarPlaceholder` with a real, standalone AI sidebar component containing a header, an "AI Architect"/"Specs" tabbed layout, and the full chat/spec-list UI structure (empty state, starter chips, input, message bubble styles, Generate Spec button, one static demo spec card) — presentational only, with local-only interaction state and no wiring to any backend, Liveblocks feed, or AI generation logic.

### Concrete deliverables

- **New** `components/editor/ai-sidebar.tsx` — the sidebar root: preserves the current placeholder's floating position/slide animation/border/background, adds the header (icon, title, subtitle, close button) and the shadcn `Tabs` shell. Per `code-standards.md`'s "keep modules small," the AI Architect tab content and Specs tab content may be split into their own files (e.g. `components/editor/ai-architect-tab.tsx`, `components/editor/specs-tab.tsx`) — Dev's call on exact split, not mandated by this brief.
- **Deleted** `components/editor/ai-sidebar-placeholder.tsx` — fully superseded, confirm no remaining references (mirrors how spec 11 deleted `canvas-placeholder.tsx`).
- **Modified** `components/editor/workspace-shell.tsx` — swaps `AiSidebarPlaceholder` for the new component; the existing `isAiSidebarOpen` boolean state and `workspace-navbar.tsx`'s toggle button are otherwise untouched, but `WorkspaceShell` now also passes an `onClose` callback (`() => setIsAiSidebarOpen(false)`) for the new in-sidebar close button.
- **Modified** `components/editor/workspace-shell.test.tsx` — its current assertions anchor on the placeholder's literal text ("AI chat is coming soon") and lack of a close button; these will need updating to match the new component (not a rewrite of the toggle-behavior tests themselves).
- **New** test file(s) for the new sidebar component(s), following this repo's `*.test.tsx` + `@vitest-environment jsdom` convention.
- **Modified** `context/ui-context.md` — new "AI Sidebar" section under Layout Patterns or Canvas, documenting the header/tabs/chat/specs structure and the token choices made here, same precedent every prior UI spec (13–19) has followed.
- No changes anywhere in `app/api`, `lib`, `trigger`, or `prisma` — this spec has no backend surface.

### Acceptance criteria

1. `components/editor/ai-sidebar-placeholder.tsx` is removed; the AI sidebar is a standalone component rendered by `WorkspaceShell` in its place, with `isOpen` still controlled by `WorkspaceShell`'s existing `isAiSidebarOpen` state — the toggle mechanism in `workspace-navbar.tsx` is unchanged.
2. The sidebar preserves its current floating placement (`absolute top-0 right-0`, full height, `w-80`), slide transform (`translate-x-full` ↔ `translate-x-0`, `duration-200 ease-in-out`), and border/background treatment (`border-l border-surface-border`, `bg-elevated/95 backdrop-blur`) exactly as the placeholder already has them (see Open Questions #1 on the spec text's own `bg-base/95`/"shadow" wording, which doesn't match what's actually there today).
3. Header shows a small bot icon, an "AI Workspace" title in `text-copy-primary`, a "Collaborate with Ghost AI" subtitle in `text-copy-muted`, and a right-aligned close button that closes the sidebar via the new `onClose` callback.
4. A shadcn `Tabs` control below the header offers exactly two tabs, "AI Architect" and "Specs"; the active tab is visually distinguished from the inactive one using only existing design tokens (see Open Questions #2 for the recommended token mapping).
5. AI Architect tab renders: a scrollable chat message area; an empty state (bot icon, short description, three starter prompt chips reading exactly "Design an e-commerce backend", "Create a chat app architecture", "Build a CI/CD pipeline") shown when there are no messages; a bottom input area with a shadcn `Textarea` (auto-resizing, ~72px min height / 160px max height) and a Send button.
6. In the input area, `Enter` (without `Shift`) submits and `Shift+Enter` inserts a newline — both are local-only component behavior (see Open Questions #3 for what "submit" does with no backend wired yet).
7. User chat bubbles render right-aligned; assistant chat bubbles render left-aligned; both styled with existing tokens only (see Open Questions #2).
8. Specs tab renders a "Generate Spec" button and exactly one static demo spec card (icon, title, short snippet, a visually-disabled download action), styled with `bg-elevated`/`border-surface-border` — no data fetching, no real spec list.
9. No Liveblocks (`ai-chat`/`ai-status-feed`), no `/api/ai/*` calls, and no Trigger.dev references appear anywhere in the diff.
10. No `components/ui/*` foundation file (`tabs.tsx`, `button.tsx`, `textarea.tsx`, `scroll-area.tsx`, etc.) is modified — all styling on shadcn components is via `className` overrides on their existing exported props, per `ai-workflow-rules.md`'s Protected Foundation Components rule.
11. No raw hex values and no raw Tailwind color classes (`zinc-*`, `white`, `black`, etc.) anywhere in the new/changed code — every color used is one of the tokens documented in `ui-context.md`/`globals.css`.
12. `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, and `npx next build` all pass.

### Dependencies

- Spec 08 (Editor Workspace Shell) — created `ai-sidebar-placeholder.tsx` and the `isAiSidebarOpen` toggle this spec builds on. Complete.
- Spec 01 (Design System) — `Button`, `Tabs`, `Textarea`, `ScrollArea` shadcn primitives and the full token set in `globals.css`. Complete.
- Spec 19 (Presence Avatars & Cursor) — most recent completed spec; this branch stacks on its (not-yet-merged) PR #13. No functional dependency, just the current HEAD state.
- Explicitly **not** a dependency of this spec, despite adjacency: specs 22/24 (`/api/ai/design`, `ai-status-feed`), 25 (`ai-chat` feed), 26 (prompt submission wiring), 27/28/29 (`/api/ai/spec`, spec persistence, spec list/preview/download). All of these build on top of the shell this spec delivers, per those specs' own text (e.g. spec 25/29 both say "use the existing sidebar input"/"existing sidebar layout, do not redesign"). None are prerequisites for spec 20.

### Open questions

1. **The spec text describes preserving "border, background, and shadow styling" and offers `bg-base/95` as an example, but the actual current placeholder (`ai-sidebar-placeholder.tsx`) has no shadow class at all and uses `bg-elevated/95`, not `bg-base/95`.** Recommendation: treat "preserve the existing... styling" as the controlling instruction and keep `bg-elevated/95` with no added shadow — this also matches `ProjectSidebar`'s parallel floating-overlay convention (`bg-elevated`, no shadow) and `ui-context.md`'s Layout Patterns entry for sidebars ("floating overlay with dark semi-transparent background and subtle border" — no shadow mentioned). Read `bg-base/95` in the spec as a loosely-worded illustrative example, not a literal directive to change the background. Flagging as a recommendation, not a decision — Dev/QA should sanity-check this against the spec text if it reads differently to them.

2. **Several color/token names in the spec text don't exist verbatim in this codebase** (`text-primary-text`, `text-muted-text`, `bg-accent`, `text-accent`, `text-accent-text`, `bg-brand-dim`). Nearest-real-token mapping and reasoning:
   - `text-primary-text` → `text-copy-primary`, `text-muted-text` → `text-copy-muted`: unambiguous, these are the only tokens for those roles.
   - `bg-brand-dim` (user message bubble) → `bg-accent-dim`: the only real "dim" token in the palette, and it's already paired with the literal, correctly-named `border-brand` on the same line.
   - `text-accent-text` (starter chips, assistant bubble text) → `text-ai-text`: `ui-context.md`'s theme table documents `--accent-ai-text`/class `text-ai-text` specifically under the role "AI text" — the closest real match by both name and by fitting this content (AI-suggested prompts, assistant replies) rather than the generic app-wide `brand` cyan.
   - `bg-accent`/`text-accent` (active tab, Send button) — genuinely ambiguous, since real shadcn `bg-accent`/`text-accent` classes exist in this project but resolve to a near-invisible dark grey (`#1e1e23`/`#f0f0f4`, effectively identical to `bg-subtle`), which would read as no visible "accent" at all for either an active-tab indicator or a primary call-to-action button. Recommendation: for the **tab active state**, reuse the `bg-accent-dim`/`text-brand` pairing already established as this codebase's "active" convention in `project-sidebar.tsx` and `share-dialog.tsx` — keeps sidebar-tab styling consistent with the rest of the app. For the **Send button**, use `bg-ai`/`text-copy-primary` — a vivid, AI-purple call-to-action (consistent with reserving the `ai`/`ai-text` pair for AI-facing affordances per point above) rather than `text-white`, which isn't a token this codebase uses anywhere and would need to be a raw color class. Both are recommendations Dev should apply but can deviate from with a documented reason if they read the spec differently — QA should check for token-only compliance (no raw hex/`zinc-*`/`white`) rather than pixel-matching an exact color.

3. **The spec has no backend to submit to (Scope Limits explicitly forbid AI/backend logic), but it does require `Enter` to "submit" and starter chips to be clickable.** Recommendation: submitting (Enter or the Send button) appends the typed text as a local, ephemeral user-bubble to the sidebar's own local chat-message array (no assistant reply, no persistence, no network call) — purely so the empty-state → message-list transition and the user-bubble styling (criterion 7) are actually visible within this spec's own scope, matching how spec 04's project dialogs used local-only mock mutations before a real API existed. Starter chips: recommend they fill the textarea with their own text (not auto-submit), the more common pattern for this kind of "prompt suggestion" UI. Both are recommendations, not spec-mandated behavior — the spec's own text is silent on this.

4. **"Generate Spec" button has no stated disabled/inert requirement (only the download action is explicitly called "disabled").** Recommendation: render it as a normal, enabled-looking `Button` with no wired `onClick` handler (or a no-op) — visually ready, functionally inert until spec 27/29 wire it up. This differs from the download action, which should visually read as disabled (shadcn `Button`'s native `disabled` prop) since the spec explicitly says so.

5. **Demo spec card content (title/snippet text) isn't specified.** Recommendation: any short, clearly-placeholder copy (e.g. "System Design Spec" / a one-line lorem-ish snippet) — purely cosmetic, no acceptance criterion depends on the exact wording.

6. **Should the sidebar also close on `Escape` or an outside click, beyond the new header close button?** The spec doesn't ask for this, and the current placeholder has no such behavior (only the navbar toggle opens/closes it). Recommendation: don't add either — out of scope per "don't rebuild the existing sidebar open/close behavior," and adding new dismiss triggers would be expanding that behavior, not preserving it.

If none of the above land where the human reviewer expects, they're all cheap to adjust in a QA/PO escalation round — none of them touch `app/api`, Liveblocks, or persistence.

### Out-of-scope callouts

- **No Liveblocks wiring** (`ai-chat` feed, `ai-status-feed`, `useRealtimeRun`, presence/thinking updates) — explicitly specs 24/25/26's job, per Scope Limits ("don't add Liveblocks or AI generation logic yet").
- **No `/api/ai/design` or `/api/ai/spec` calls, no Trigger.dev** — specs 22/23/27's job.
- **No real spec list/fetch/preview/download** — spec 29's job ("existing sidebar layout, do not redesign" is explicitly written against what this spec delivers). The Specs tab here is a single static demo card only.
- **No chat message schema/Zod validation** — spec 25 explicitly owns defining that in `types/tasks.ts`; this spec's local chat-bubble state (if any, per Open Questions #3) is not a shape other specs should import or depend on.
- **No new Prisma models, migrations, or `app/api` routes.**
- **No hardcoded hex colors**, even though spec 26's own later text (`context/feature-specs/26-design-agent-frontend.md`) describes a literal `#62C073` green for chat bubbles — that's a problem for spec 26's own Analyst pass to resolve against `code-standards.md`'s token rule, not something spec 20 should preempt or match. Spec 20's bubble colors (Open Questions #2) are token-only and are what ships now; a later spec may restyle them, but only through tokens.
- **No changes to `components/ui/*`** (Tabs, Button, Textarea, ScrollArea) — style via `className` overrides only, per the Protected Foundation Components rule.
- **No changes to `workspace-navbar.tsx` or the AI-sidebar toggle button itself** — the toggle already exists and works; only `workspace-shell.tsx` needs the new `onClose` wiring for the sidebar's own close button.

## Dev Notes

### Files added/changed

- `components/editor/ai-sidebar.tsx` (new) — the sidebar root: preserves the placeholder's floating position/slide transform/border/background exactly, adds the header (bot icon, "AI Workspace" title, "Collaborate with Ghost AI" subtitle, close button calling the new `onClose` prop) and a shadcn `Tabs` shell with "AI Architect"/"Specs" triggers. Active-tab styling is computed from local `activeTab` state (`bg-accent-dim`/`text-brand` when active, `text-copy-muted` otherwise) rather than relying on Base UI's own `data-active` attribute — matches this codebase's existing `isActive`-boolean convention (`project-sidebar.tsx`, `share-dialog.tsx`) instead of introducing a new attribute-selector styling pattern.
- `components/editor/ai-architect-tab.tsx` (new) — chat UI: scrollable message area, empty state (bot icon, description, three starter prompt chips with the brief's exact copy), bottom input row (auto-resizing `Textarea`, `min-h-[72px] max-h-[160px]`, Send button). `Enter` (no `Shift`) submits, `Shift+Enter` inserts a newline. Submitting appends a local, ephemeral `{ id, role: "user", content }` message to a `useState` array — no assistant reply, no persistence, no network call. Starter chips fill the textarea (and focus it) rather than auto-submitting. Also exports `ChatBubble`, a standalone component rendering user bubbles right-aligned (`border-brand`/`bg-accent-dim`/`text-copy-primary`) and assistant bubbles left-aligned (`border-surface-border`/`bg-subtle`/`text-ai-text`) — the assistant branch isn't reachable through this spec's own UI (no AI reply mechanism exists yet) but is real, directly-tested code so criterion 7's contract is genuinely implemented, not just aspirational.
- `components/editor/specs-tab.tsx` (new) — a "Generate Spec" button (enabled-looking, no wired `onClick`) and exactly one static demo spec card (`FileText` icon, "System Design Spec" title, a placeholder snippet, a `disabled` download icon button), styled with `bg-elevated`/`border-surface-border`.
- `components/editor/ai-sidebar-placeholder.tsx` (deleted) — fully superseded by `ai-sidebar.tsx`; confirmed via `grep` that no remaining code imports it (only historical markdown/progress-tracker mentions and this spec's own doc-comment reference by name remain).
- `components/editor/workspace-shell.tsx` (modified) — swaps `AiSidebarPlaceholder` for `AiSidebar`, passing `onClose={() => setIsAiSidebarOpen(false)}`. `isAiSidebarOpen` state and the navbar's toggle button are untouched. Doc comment updated to describe the new component instead of the placeholder.
- `components/editor/workspace-shell.test.tsx` (modified) — assertions that anchored on the placeholder's literal text ("AI chat is coming soon") now anchor on the real header text ("AI Workspace"); added a new test for the sidebar's own close button. The toggle-behavior tests themselves are otherwise unchanged.
- `components/editor/ai-sidebar.test.tsx`, `components/editor/ai-architect-tab.test.tsx`, `components/editor/specs-tab.test.tsx` (all new) — see Test coverage below.
- `context/ui-context.md` (modified) — new "AI Sidebar" section under Canvas (positioning/header/tabs/chat/specs conventions and the token choices made here), following the same precedent every prior UI spec (13–19) has followed.

### Skills used

- None applicable. No Clerk/Prisma/Liveblocks surface touched by this spec — it's a presentational-only component shell, consistent with the brief's Scope Limits.

### Key decisions (resolving the brief's Open Questions)

1. **Background/border/shadow**: kept the placeholder's real `bg-elevated/95` with no shadow, per the brief's own recommendation — treated the spec text's `bg-base/95`/"shadow" wording as a loosely-worded illustrative example, not a literal directive.
2. **Token mapping**: applied the brief's full recommended mapping — `text-copy-primary`/`text-copy-muted` for primary/muted text, `bg-accent-dim` for the user-bubble/active-tab fill, `text-ai-text` for AI-facing text (starter chips, assistant bubble text, header icon), `border-brand` paired with the user bubble's `bg-accent-dim`, `bg-accent-dim`/`text-brand` for the active tab (reusing `project-sidebar.tsx`/`share-dialog.tsx`'s existing "active" convention), and `bg-ai`/`text-copy-primary` for the Send button.
3. **Local-only submit behavior**: submitting (Enter or Send) appends a local ephemeral user bubble with no assistant reply/persistence/network call; starter chips fill the textarea without auto-submitting — both exactly as recommended.
4. **Generate Spec button**: rendered enabled-looking with no wired `onClick`, distinct from the download action which uses the shadcn `Button`'s native `disabled` prop — exactly as recommended.
5. **Demo spec card copy**: "System Design Spec" / a one-line placeholder snippet — cosmetic only, no criterion depends on exact wording.
6. **No Escape/outside-click dismissal added** — only the new header close button and the existing navbar toggle close the sidebar, per the recommendation not to expand the existing open/close behavior.

One deviation worth flagging for QA/PO: the brief left the file split ("Dev's call") as `ai-architect-tab.tsx`/`specs-tab.tsx`; I additionally exported `ChatBubble` from `ai-architect-tab.tsx` (rather than inlining it in the message-list render) specifically so the assistant-bubble styling required by criterion 7 has direct unit-test coverage despite not being reachable through this spec's own UI. This is an implementation-detail addition, not a scope change.

### Test coverage

- `components/editor/ai-sidebar.test.tsx` (new, 6 tests) — header content, floating/slide/border class preservation, `aria-hidden` reflecting `isOpen`, `onClose` wired to the header close button, exactly two tabs with AI Architect active by default, tab switching + active-tab token styling, and a guard test asserting no Liveblocks/`/api/ai`/Trigger.dev strings anywhere in the rendered output.
- `components/editor/ai-architect-tab.test.tsx` (new, 8 tests) — empty state + exact starter-chip copy, chip click fills (not submits) the textarea, Enter submits and clears the input, Shift+Enter does not submit, Send button submits and is disabled while empty, whitespace-only input doesn't submit, plus two `ChatBubble` tests (user right-aligned, assistant left-aligned with the AI-text token).
- `components/editor/specs-tab.test.tsx` (new, 3 tests) — enabled Generate Spec button, exactly one demo card with a disabled download action, and a guard test for raw hex/Tailwind-color-class strings.
- `components/editor/workspace-shell.test.tsx` (modified) — updated to the new header text, added a close-button test; other tests (toggle behavior, Share dialog, Templates modal wiring) unchanged in intent.
- Found and fixed one real test bug during the initial run: `does not submit on Shift+Enter` originally asserted `queryByText("line one")` was absent, but that also matches the textarea's own displayed value (React renders a textarea's content as a real child text node), producing a false failure. Fixed by asserting on the still-present empty-state chips instead — a state that only exists when no message was appended — which is what the test actually needs to prove.
- Commands run: `npx tsc --noEmit` (pass, no errors), `npx eslint .` (pass, only one pre-existing unrelated warning in `.agents/skills/clerk-tanstack-patterns/...`), `npx vitest run --no-file-parallelism` (**316/316 tests passing across 41 files**, up from 298/38 at the end of spec 19), `npx next build` (pass — Turbopack build compiled successfully, typecheck clean, all routes/pages generated). Note: a first `npx vitest run` attempt (default parallelism) hit the same environment-driven worker-timeout flakiness documented in spec 18's Dev Notes (10 files failed to start a worker in time) — resolved the same way, with `--no-file-parallelism`.

### Known limitations / deliberate deferrals

- Chat and Specs tab local state fully resets when navigating away and back to `/editor/[roomId]` (component unmount) since nothing is persisted — expected and explicitly in scope per the brief (no Liveblocks/backend wiring yet).
- `AiArchitectTab`'s `TabsContent` is rendered with `keepMounted` so switching to the Specs tab and back preserves in-progress chat/input state within a single session — a presentation-layer convenience, not a requirement of any acceptance criterion; the Specs tab has no analogous state to preserve, so it doesn't need it.
- No visual/browser verification was possible in this pipeline (consistent with prior specs) — a human smoke test (open/close via both the navbar toggle and the new header close button, switch tabs, submit a message via Enter and via Send, click a starter chip, confirm the input auto-grows up to the 160px cap then scrolls) is recommended before considering this fully proven.
