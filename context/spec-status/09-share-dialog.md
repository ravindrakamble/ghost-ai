# Spec 09 — Share Dialog

Source spec: `context/feature-specs/09-share-dialog.md`

## Analyst Brief

### Scope statement

Wire the existing inert Share button in the workspace navbar (spec 08) to a functional Share dialog: owners can view/invite/remove collaborators by email and copy the project link; collaborators get read-only visibility of the collaborator list. Includes the API routes and Clerk Backend API enrichment (display name, avatar) needed to back that dialog. Nothing about real-time canvas membership, email notifications, or permission tiers beyond owner/collaborator is in scope.

### Concrete deliverables

**New:**
- `app/api/projects/[projectId]/collaborators/route.ts` — `GET` (list collaborators, Clerk-enriched), `POST` (invite by email). Mirrors the existing `app/api/projects/[projectId]/route.ts` pattern from spec 06 (thin handler, shared logic in `lib`, 401/404/403 precedence).
- `app/api/projects/[projectId]/collaborators/[collaboratorId]/route.ts` — `DELETE` (remove a collaborator by `ProjectCollaborator.id`).
- `lib/collaborators.ts` — shared logic: list/invite/remove against `prisma.projectCollaborator`, plus Clerk enrichment via `clerkClient()` from `@clerk/nextjs/server` (`users.getUserList({ emailAddress: [...] })`, matched back to each collaborator's stored email; falls back to email-only when no Clerk user matches). `@clerk/nextjs` is already installed — no new package needed.
- `types/collaborator.ts` — display shape, e.g. `{ id: string; email: string; name: string | null; avatarUrl: string | null }`.
- `components/editor/share-dialog.tsx` — dialog UI: collaborator list (avatar/name-or-email), invite email input + submit (owner only), remove control per row (owner only), copy-project-link button with temporary "Copied!" feedback.
- `hooks/use-collaborators.ts` — client hook owning fetch/invite/remove calls and loading/error state (new hooks go in the top-level `hooks/` folder per `architecture-context.md`'s Hooks Convention).

**Modified:**
- `components/editor/workspace-navbar.tsx` — Share button becomes functional (opens the dialog) instead of inert; per spec 08's Dev notes this was left visually present but wired to nothing.
- `components/editor/workspace-shell.tsx` — owns share-dialog open/closed state, renders `ShareDialog`, passes project (and owner/collaborator role — see Open Question 1) down.
- `lib/project-access.ts` — extend the `ok: true` branch of `ProjectAccessResult` to also return whether the caller is the owner (see Open Question 1); `isOwner` is already computed internally and currently discarded.
- `app/editor/[roomId]/page.tsx` — thread the extended access result through to `WorkspaceShell` if its shape changes.

### Acceptance criteria

1. The Share button in the workspace navbar opens the Share dialog (previously inert per spec 08).
2. The dialog lists current collaborators, showing Clerk display name + avatar when a matching Clerk user exists for that email, and falling back to the raw email when no match is found.
3. When the caller is the project owner, the dialog shows an email input and an invite action; submitting a valid email adds a `ProjectCollaborator` row and the new collaborator appears in the list without a full page reload.
4. When the caller is the project owner, each collaborator row has a remove control; removing deletes the `ProjectCollaborator` row and it disappears from the list without a full page reload.
5. When the caller is a collaborator (not the owner), the dialog shows the collaborator list only — no invite input, no remove controls.
6. The dialog has a "copy project link" action that copies the project URL to the clipboard and shows temporary "Copied!" feedback that reverts after a short delay.
7. `GET /api/projects/[projectId]/collaborators` succeeds for any project member (owner or collaborator) and rejects unauthenticated or non-member callers, consistent with `lib/project-access.ts`'s existing owner-or-collaborator view gate.
8. `POST /api/projects/[projectId]/collaborators` (invite) is rejected server-side with 403 for any caller who is not the project owner, regardless of what the client UI shows.
9. `DELETE /api/projects/[projectId]/collaborators/[collaboratorId]` (remove) is rejected server-side with 403 for any caller who is not the project owner.
10. No local user table is introduced; collaborators remain stored by email only on `ProjectCollaborator`, and Clerk data is looked up live via the Clerk Backend API, not cached into a new table.
11. `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, and `npm run build` all pass (the spec's own check list names `npm run build`; the others are the standing bar every prior spec in this pipeline has been held to per `code-standards.md`).

### Dependencies

- Spec 06 (Project APIs) — `ProjectCollaborator` Prisma model, `lib/projects.ts#getOwnedProjectOrError` ownership pattern. **Complete.**
- Spec 08 (Editor Workspace Shell) — `WorkspaceShell`, `WorkspaceNavbar` with the inert Share button, `/editor/[roomId]` route. **Complete** (pipeline-complete per `progress-tracker.md`; only awaiting a human sign-off checkpoint, not a blocking dependency).
- `lib/project-access.ts` (spec 08) — owner-or-collaborator view-access gate. **Complete**, but needs the small extension described in Open Question 1.
- Clerk (`@clerk/nextjs`) — already installed and configured (spec 03/Clerk setup); `clerkClient()` Backend API access requires no new package.

### Open questions

1. **No existing signal for "is the caller the owner" reaches the client.** `getProjectAccess`'s `ok: true` branch currently returns only `{ id, name }` (see `lib/project-access.ts`), discarding the `isOwner` boolean it computes internally. The dialog needs to know this to decide whether to render invite/remove controls at all.
   **Recommendation:** extend the `ok: true` branch to include `isOwner: boolean` and thread it through `WorkspaceShell` → `ShareDialog`. This is a UX-only signal — the real security boundary stays server-side in the invite/remove route handlers (acceptance criteria 8–9), so getting this wrong doesn't create a security gap, only a UI-affordance one.

2. **Collaborator-removal route shape.** The spec says "remove collaborators" without specifying how a collaborator is addressed (by `ProjectCollaborator.id` vs. by email in a request body).
   **Recommendation:** nested route by ID — `DELETE /api/projects/[projectId]/collaborators/[collaboratorId]` — mirroring the existing `app/api/projects/[projectId]/route.ts` PATCH/DELETE convention from spec 06.

3. **Invite edge cases are unstated:** invalid email format, inviting an email that's already a collaborator (the schema's `@@unique([projectId, email])` will throw on this), and inviting the owner's own email.
   **Recommendation:** 400 for invalid email format (basic validation before touching the DB, per code-standards' "validate unknown external input at system boundaries"); map the Prisma unique-constraint violation (`P2002`) to a 409 rather than a 500; reject inviting the owner's own email with 400 (an owner can't be a redundant collaborator on their own project). Flagging as a recommendation, not a decision — Senior Developer/QA should confirm this is reasonable given the spec's silence.

4. **Does listing collaborators require project-membership, or just any authenticated user?** The spec only explicitly says to "enforce ownership server-side for invite and remove," not for listing.
   **Recommendation:** gate `GET .../collaborators` the same way `/editor/[roomId]` is gated — owner-or-collaborator via `lib/project-access.ts`'s existing pattern — not just "any signed-in user," since the collaborator list (emails, names) is project-scoped data and the spec's own collaborator permissions section implies membership is required to "view the collaborator list."

### Out-of-scope callouts

- **No local user table.** Explicitly stated in the spec itself — collaborators stay email-keyed on `ProjectCollaborator`; Clerk is queried live per request/list, not synced into a new persisted `User` model.
- **No email notification or invite-link delivery system.** "Invite by email" means adding the email to `ProjectCollaborator` so that address gains access on next sign-in — it does not mean sending an email, since no email-sending service appears anywhere in `architecture-context.md`'s stack. A less careful reading of "invite" could pull in a notification feature; excluded.
- **The copied project link is not itself an access grant.** It's a convenience URL to `/editor/[projectId]`; opening it still runs through the existing `lib/project-access.ts` owner-or-collaborator gate. This spec does not introduce a public/unauthenticated share-link mechanism.
- **No Liveblocks room membership or token changes.** Adding/removing a `ProjectCollaborator` row only affects the DB-level view-access gate (`lib/project-access.ts`) used by `/editor/[roomId]`. Any live-presence or room-token implications belong to spec 10 (Realtime canvas) and are not touched here.
- **No per-collaborator role granularity** (e.g. viewer vs. editor collaborator tiers). Per `project-overview.md`'s Out of Scope list ("Enterprise permission tiers beyond owner and collaborator"), the only roles are owner and collaborator, exactly as this spec states.
- **No collaborator self-removal ("leave project") flow.** The spec gives collaborators view-only access to the list and gives remove capability to owners only; a self-service leave action isn't mentioned and isn't added.
- **No billing/seat-limit logic** on how many collaborators a project can have — out of scope per `project-overview.md`.

## Dev Notes

### Files added

- `types/collaborator.ts` — `Collaborator` display shape (`{ id, email, name, avatarUrl }`).
- `lib/collaborators.ts` — `isValidEmail`, `listCollaborators` (DB + Clerk-enrichment), `inviteCollaborator` (maps Prisma `P2002` → 409), `removeCollaborator` (scoped `deleteMany`, atomic 404-on-no-match). Clerk enrichment (`fetchClerkEnrichmentByEmail`) is best-effort: a Clerk Backend API failure falls back to email-only for the whole batch rather than failing the list request, logged via `console.error`.
- `lib/collaborators.test.ts` — unit tests for all four exports, including the P2002→409 mapping and the Clerk-call-throws fallback path.
- `app/api/projects/[projectId]/collaborators/route.ts` — `GET` (owner-or-collaborator gate via `lib/project-access.ts#getProjectAccess`, per Open Question 4's recommendation) and `POST` (owner-only via `lib/projects.ts#getOwnedProjectOrError`; validates email format, rejects self-invite, maps invite-lib errors to their statuses).
- `app/api/projects/[projectId]/collaborators/route.test.ts` — GET/POST route tests (401/404/403/400/409/201 branches).
- `app/api/projects/[projectId]/collaborators/[collaboratorId]/route.ts` — `DELETE`, owner-only, 404 when the collaborator doesn't belong to the given project.
- `app/api/projects/[projectId]/collaborators/[collaboratorId]/route.test.ts` — DELETE route tests.
- `hooks/use-collaborators.ts` — owns collaborator list state, `invite`, `remove`, `refetch`. **No internal `useEffect`** — see Key decisions below.
- `hooks/use-collaborators.test.ts` — tests for refetch/invite/remove success and failure paths.
- `components/editor/share-dialog.tsx` — presentational dialog UI: copy-link button with 2s "Copied!" revert, owner-only invite form, collaborator list with Clerk avatar-or-initial, owner-only per-row remove control, name-or-email fallback rendering.
- `components/editor/share-dialog.test.tsx` — owner vs. non-owner rendering, invite/remove wiring, copy-link feedback, loading/error states, close-triggered local-state reset.

### Files modified

- `lib/project-access.ts` + `lib/project-access.test.ts` — `ProjectAccessResult`'s `ok: true` branch now also returns `isOwner: boolean` (previously computed and discarded), per Open Question 1. Documented as a UX-only signal — mutation routes still enforce ownership independently.
- `app/editor/[roomId]/page.tsx` + `app/editor/[roomId]/page.test.tsx` — threads `access.isOwner` through to `WorkspaceShell`.
- `components/editor/workspace-navbar.tsx` — Share button now takes an `onOpenShare` callback and is no longer inert.
- `components/editor/workspace-shell.tsx` — owns `isShareOpen` state and the `useCollaborators` hook instance; renders `ShareDialog`, passing collaborator state/handlers down as props.
- `components/editor/workspace-shell.test.tsx` — replaced the spec-08 "inert share button" assertion with one confirming the Share dialog now opens; added a stubbed global `fetch` since opening the dialog triggers a real collaborator fetch.

### Key decisions

- **Open Question 1 (isOwner signal):** implemented exactly as recommended — extended `getProjectAccess`'s `ok: true` branch.
- **Open Question 2 (remove route shape):** implemented as recommended — nested `DELETE .../collaborators/[collaboratorId]`.
- **Open Question 3 (invite edge cases):** implemented as recommended — 400 for malformed email, 409 for duplicate (`P2002`), 400 for self-invite (compared against the caller's own Clerk primary email, since `getOwnedProjectOrError` having already confirmed `userId === ownerId` means the caller's Clerk profile *is* the owner's).
- **Open Question 4 (GET gating):** implemented as recommended — `GET` uses the owner-or-collaborator view gate, not owner-only.
- **`useCollaborators` has no auto-fetch effect, and the hook call was lifted from `ShareDialog` into `WorkspaceShell` (not specified either way by the brief).** The first implementation fetched on dialog-open via a `useEffect([open])` inside `ShareDialog`, but `eslint-plugin-react-hooks`'s `set-state-in-effect` rule (new in this Next 16 toolchain — see AGENTS.md's warning about breaking changes) flagged it as an error: calling `setIsLoading(true)` synchronously at the top of an effect-triggered async fetch is a cascading-render pattern. Since `ShareDialog` is opened by an external button click that lives in `WorkspaceShell` (the dialog itself never receives an "I was just opened" event — only a controlled `open` boolean), the correct non-effect fix is to trigger the fetch directly from that click handler. This meant lifting `useCollaborators` into `WorkspaceShell` and making `ShareDialog` presentational (props in, callbacks out). `ShareDialog` still resets its own local UI state (email input, copy feedback) on close, but does so via a wrapped `onOpenChange` handler (a real event-handler callback from Base UI's Dialog, fired on every close path — Escape, backdrop, close button) rather than an effect watching `open`.
- Avatar rendering uses a plain `<img>` (with an eslint-disable for `@next/next/no-img-element`, since the URL is Clerk-hosted and not a local/optimizable asset) rather than adding a new `components/ui/avatar.tsx` via the shadcn CLI — no other spec needs a reusable Avatar primitive yet, and the fallback (initial-letter circle) is simple enough to keep inline in `share-dialog.tsx`. Worth revisiting if a later spec needs avatars elsewhere.

### Test coverage

New/updated test files: `lib/collaborators.test.ts`, `lib/project-access.test.ts`, `app/api/projects/[projectId]/collaborators/route.test.ts`, `app/api/projects/[projectId]/collaborators/[collaboratorId]/route.test.ts`, `app/editor/[roomId]/page.test.tsx`, `hooks/use-collaborators.test.ts`, `components/editor/share-dialog.test.tsx`, `components/editor/workspace-shell.test.tsx`.

Commands run, all passing:
- `npx tsc --noEmit` — pass, no errors.
- `npx eslint .` — pass (one pre-existing unrelated warning in `.agents/skills/.../__root.tsx`, not touched by this spec).
- `npx vitest run` — 110/110 passing across 16 files.
- `npx next build` — pass, all routes compile including the two new collaborator route handlers.

### Known limitations / deferrals

- Clerk enrichment does a fresh `users.getUserList` call on every list/invite request (no caching layer) — acceptable per the brief's "No local user table" constraint and current traffic scale; would need revisiting if collaborator lists get large or this endpoint gets hit frequently.
- No optimistic UI rollback distinction beyond the existing error message on invite/remove failure (matches the pattern already established by `hooks/use-project-actions.ts`).
- Not visually verified in-browser (no signed-in Clerk session available in this environment) — verified via type-check, lint, unit tests, and production build only, consistent with prior specs' documented limitation.

## QA Report

**Overall verdict: PASS**

### Mechanical gate

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass — no errors |
| `npx eslint .` | Pass — 0 errors, 1 pre-existing warning in `.agents/skills/.../__root.tsx` (unrelated to this spec, not touched by it) |
| `npx vitest run` | Pass — 110/110 tests across 16 files |
| `npx next build` (`npm run build`) | Pass — all routes compiled, including `/api/projects/[projectId]/collaborators` and `/api/projects/[projectId]/collaborators/[collaboratorId]` |

All four independently re-run, not just taken on Dev's word.

### Acceptance criteria

1. Share button opens the dialog — **Pass**. `WorkspaceNavbar`'s Share button now takes `onOpenShare`; `WorkspaceShell` wires it to `handleOpenShare` which sets `isShareOpen` and triggers `refetch()`. Verified via `workspace-shell.test.tsx`'s "opens the Share dialog when the Share button is clicked".
2. Lists collaborators, Clerk name+avatar when matched, raw email fallback — **Pass**. `lib/collaborators.ts#fetchClerkEnrichmentByEmail` + `toCollaborator`; `share-dialog.tsx` renders `name ?? email`; tested in both `lib/collaborators.test.ts` and `share-dialog.test.tsx`.
3. Owner sees invite input; submitting adds a row and updates the list without reload — **Pass**. `POST` route creates the row; `useCollaborators#invite` appends the returned collaborator to local state (no `router.refresh`/reload). Verified in `hooks/use-collaborators.test.ts` and route test's 201 case.
4. Owner sees remove control; removing deletes the row and updates the list without reload — **Pass**. `DELETE` route + `useCollaborators#remove` filters local state. Verified in hook and route tests.
5. Collaborator (non-owner) sees list-only, no invite/remove controls — **Pass**. `isOwner &&` gates both the invite form and the per-row remove button in `share-dialog.tsx`; explicit test "hides the invite input and remove controls for a non-owner collaborator".
6. Copy-link action with temporary "Copied!" feedback — **Pass**. `handleCopyLink` writes `${origin}/editor/${projectId}` to the clipboard, flips `isCopied` for 2s. Verified with fake timers in `share-dialog.test.tsx`.
7. `GET .../collaborators` succeeds for owner-or-collaborator, rejects unauthenticated/non-member — **Pass**. Uses `getProjectAccess` (the same view-access gate as `/editor/[roomId]`); 401/404/403 branches all covered in `route.test.ts`.
8. `POST` (invite) rejected 403 for non-owner server-side — **Pass**. Uses `getOwnedProjectOrError`; tested independent of client UI state.
9. `DELETE` (remove) rejected 403 for non-owner server-side — **Pass**. Same gate; tested.
10. No local user table; collaborators stay email-keyed on `ProjectCollaborator`, Clerk queried live — **Pass**. Confirmed via `prisma/schema.prisma` (only `Author`, `Post`, `Project`, `ProjectCollaborator` models — no new `User` model) and `lib/collaborators.ts` calling `clerkClient()` per request with no persistence of the enrichment result.
11. `tsc`/`eslint`/`vitest`/`next build` all pass — **Pass**, see mechanical gate table above.

All 11 acceptance criteria verified directly against the code and independently re-run tests/build, not just the Dev Notes' claims.

### Architecture invariants

- No long-running AI work in a request handler — n/a to this spec, not violated.
- Metadata vs. blob storage kept separate — this spec is DB-only (`ProjectCollaborator`), no blob interaction; not violated.
- Auth/ownership enforced at every mutation boundary — `POST`/`DELETE` both gate through `getOwnedProjectOrError` (owner-only mutation gate, kept distinct from the view-only `getProjectAccess` used by `GET`); confirmed via route code and tests, not just UI-level `isOwner` hiding.
- Client components only where interactivity requires it — `share-dialog.tsx` and `workspace-shell.tsx` are `"use client"`; `workspace-navbar.tsx` has no directive of its own but is only ever rendered from the client-component tree (consistent with the pre-existing spec-08 pattern for `canvas-placeholder.tsx`/`ai-sidebar-placeholder.tsx`, not a new deviation introduced here).
- Canvas schema consistency — not touched by this spec.

No invariant violations found.

### Standards compliance

- No raw Tailwind color classes (`zinc-`/`slate-`/`gray-`) or hardcoded hex values in `share-dialog.tsx` or `workspace-navbar.tsx` — grep confirms clean; all colors go through token utility classes (`bg-accent-dim`, `text-brand`, `text-state-error`, `text-copy-*`, etc.).
- Border radius scale respected: `rounded-3xl` on the dialog (modal), `rounded-xl` on list rows (small element).
- No `any` usage in any new file (`lib/collaborators.ts`, both new route files, `hooks/use-collaborators.ts`, `share-dialog.tsx`, `types/collaborator.ts`) — grep confirms clean.
- `components/ui/*` untouched — `git status` on that directory shows no changes.
- Input validated at the boundary before touching the DB (`isValidEmail` before `getOwnedProjectOrError`/`inviteCollaborator`), matching code-standards' "validate unknown external input at system boundaries."
- New hook correctly placed in top-level `hooks/`, per the Hooks Convention.

### Error handling

- Invalid JSON body on `POST` → 400 (`route.test.ts`).
- Malformed email → 400, DB never touched.
- Self-invite (owner inviting their own email) → 400, compared case-insensitively.
- Duplicate invite (`P2002`) → mapped to 409, not a raw 500.
- Remove of a collaborator ID that doesn't belong to the given project → 404 via scoped `deleteMany` (atomic existence+scope check, not a separate lookup-then-delete race).
- Clerk Backend API failure during enrichment → best-effort fallback to email-only for the whole batch rather than failing the list request (`lib/collaborators.test.ts`'s "falls back to email-only for every row when the Clerk API call itself fails").
- Client-side: `useCollaborators` surfaces fetch/invite/remove failures via `error` state without corrupting existing list state (verified: failed invite/remove leaves the list unchanged).
- Clipboard-write failure surfaces a inline error message rather than failing silently.

All failure modes implied by the spec are handled, not just the happy path.

### Housekeeping

- `context/progress-tracker.md`'s "In Progress" section accurately reflects the files added/modified and the mechanical gate results for this spec.

### Issues found

None. No bugs, no spec gaps.

QA passed — ready for Product Owner review.

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Against project-overview.md

- **Success Criterion 2** ("Multiple users can collaborate in the same canvas simultaneously"): this spec is the actual mechanism by which a project becomes accessible to anyone other than its owner. Before this spec, `ProjectCollaborator` rows could only ever be created manually (there was no invite path), so no second user could ever legitimately reach `/editor/[roomId]`'s owner-or-collaborator gate. Wiring invite/list/remove genuinely moves this criterion forward, not just a UI checkbox against the brief — it's the precondition spec 10 (realtime canvas) needs to have anyone to collaborate *with*.
- **Success Criterion 6** ("Project metadata and generated artifacts are stored in the correct layers"): collaborators are DB-only (`ProjectCollaborator`, already modeled in spec 06), enriched live from Clerk with nothing persisted from that enrichment. No blob interaction, no schema change (`git diff --stat -- prisma/schema.prisma` confirms untouched). Correct layering maintained.
- No other success criteria are directly implicated by this spec (canvas, starter templates, AI generation, spec generation are untouched).

### Scope check (beyond QA's standards check)

Verified directly against the diff/code, not just Dev Notes' claims:
- **No local user table** — confirmed via `prisma/schema.prisma` diff (empty) and `lib/collaborators.ts` (Clerk queried live per request, nothing cached).
- **No email-sending/notification system** — "invite" only creates a `ProjectCollaborator` row; no mail package added, `package.json` diff is empty.
- **No permission tiers beyond owner/collaborator** — `isOwner` is a boolean UI-gate only, matching `project-overview.md`'s "Out of Scope: Enterprise permission tiers beyond owner and collaborator."
- **No Liveblocks/room-membership changes** — `workspace-shell.tsx`/`share-dialog.tsx` touch only local dialog state and the new collaborator hook; no `@liveblocks/*` imports anywhere in the diff.
- **The copied project link is not a bypass** — it's a plain `/editor/[projectId]` URL; access still routes through the existing `lib/project-access.ts` gate. Confirmed nothing new is exposed unauthenticated.
- Nothing here crosses into billing/seat limits, versioned history, or object-storage migration — all correctly untouched.

### Rough edges — acceptable at this stage

Consistent with `ai-workflow-rules.md`'s incremental philosophy, and none of these block spec 10+ from building on this correctly:
- No caching layer on Clerk enrichment (documented deferral; fine at current traffic/collaborator-list scale).
- Not visually verified in-browser (no Clerk session available in this environment) — same documented limitation as every prior spec in this pipeline.
- No collaborator self-removal ("leave project") flow — correctly out of scope per the brief, not a gap.

### progress-tracker.md accuracy

The "In Progress" section for spec 09 was **stale**: it still read "Senior Developer pass complete, QA and Product Owner review still pending," which no longer matched reality now that QA has recorded a PASS with all 11 acceptance criteria independently verified. Moved the spec 09 entry from "In Progress" to "Completed," matching the format used for specs 06–08 (files added/modified, mechanical gate results, QA verdict summary, this PO verdict), and updated "Current Goal"/"Next Up" accordingly. This is a housekeeping correction, not a product-scope finding.

### PR creation — blocked, not attempted

Per this role's process, PR creation only follows a PASS, and only after confirming (1) a dedicated `spec/09-share-dialog` branch exists with commits ahead of `main`, and (2) `gh` is authenticated. Neither holds here:
- No `spec/09-share-dialog` branch exists (`git branch -a` shows only `feat/prisma-postgres-and-project-apis` and `main`). All of specs 07, 08, and 09's work sits as **uncommitted changes** in the working tree on `feat/prisma-postgres-and-project-apis`, which itself only has a committed history through specs 05–06.
- The `gh` CLI is not available in this environment (`gh: command not found`), so auth status can't even be checked.

Per instructions, this means "stop and say so rather than creating a PR with nothing in it." This is a process/repo-hygiene gap for the human to resolve (e.g., commit spec 07/08/09's work onto an appropriately named branch and ensure `gh` is set up) — it is not a product defect in spec 09 itself, and does not change the PASS verdict above.
