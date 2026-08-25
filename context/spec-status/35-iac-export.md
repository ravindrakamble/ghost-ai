Source spec: `context/feature-specs/35-iac-export.md`

## Analyst Brief

### Scope statement

When a spec is generated (via the existing "Generate Spec" action), also generate a plain-text Terraform skeleton from the same canvas graph, persist it alongside the Markdown spec on the same `ProjectSpec` row, and let a user download it from the Specs tab. This reuses the existing `generate-spec` pipeline end to end — no new AI provider, no new trigger task, no new "Generate IaC" button.

### Concrete deliverables

- `lib/generate-spec-ai.ts` (modified) — new `generateIacSkeleton(input: { nodes: GenerateSpecGraphNode[]; edges: GenerateSpecGraphEdge[] }): Promise<string>`. Mirrors `generateSpecMarkdown` exactly: same lazily-instantiated, `globalThis`-cached Gemini provider (`getGoogleProvider()`/`GEMINI_MODEL_ID`) — **reused, not re-instantiated** — same single `generateText` call, same `maxOutputTokens: 8192` (the raw spec's own cited "lesson" — a full Terraform skeleton is comparably long-form output to a Markdown spec, and gemini-3.6-flash's reasoning-before-responding behavior already truncated spec 27's own Markdown output at a low budget). No retry logic, same as `generateSpecMarkdown` — a failure is a thrown error, propagated as-is, no wrapping/masking. A new `buildIacPrompt(input)` (mirroring `buildPrompt`) instructs the model to emit resource blocks per node (inferring a plausible Terraform resource type from each node's `label`/`shape`, no real provider credentials, no apply-ready state — a starting skeleton per the raw spec's own framing), respond with plain text only (no explanatory prose, no Markdown code fence wrapper — the download route serves it as `text/plain`, not Markdown), and — for an empty graph — still produce a short placeholder comment noting the canvas is empty, mirroring `buildPrompt`'s identical empty-graph fallback instruction.
- `lib/spec-blob.ts` (modified) — new `iacBlobPathname(projectId, specId)` returning `` `specs/${projectId}/${specId}.tf` `` (mirrors `specBlobPathname`'s `.md` pathname, same `specs/{projectId}/{specId}` root per `architecture-context.md`'s Storage Model — this is still a `ProjectSpec` artifact, not a new artifact class, so it stays in the same key prefix, just a second file for the same `specId`). New `uploadSpecIac(projectId, specId, terraform): Promise<string>`, structurally identical to `uploadSpecMarkdown` (same `SPEC_BLOB_ACCESS = "private"`, same `allowOverwrite: true`, same lazy `requireBlobToken()`), `contentType: "text/plain"` instead of `"text/markdown"`. New `fetchSpecIac(blobUrl): Promise<string | null>`, structurally identical to `fetchSpecMarkdown` (same not-found-vs-genuine-failure distinction — `null` only when the blob itself reports missing/non-200, a real upstream error still throws). Kept as separate, parallel functions rather than generalizing the existing markdown functions with a content-type parameter — avoids touching spec 28's already-shipped, already-tested `uploadSpecMarkdown`/`fetchSpecMarkdown`/`specBlobPathname` in place, per `code-standards.md`'s "do not mix unrelated concerns" and this spec's own Scope Limits (nothing here says to refactor the Markdown path).
- `prisma/schema.prisma` (modified) — add `iacFilePath String?` (**nullable**, unlike `filePath String` which is required) to `ProjectSpec`. Nullable because every `ProjectSpec` row created before this spec ships has no Terraform file and never will — there is no real content to backfill, so a required column with a placeholder default would misrepresent "no IaC was ever generated for this spec" as "an empty but valid IaC file exists." A real migration, created and applied via `prisma migrate dev` against the shared dev database (mirroring spec 33's precedent) — additive only (`ALTER TABLE "ProjectSpec" ADD COLUMN "iacFilePath" TEXT;`, no index, no default, no `NOT NULL`), so it cannot fail against existing rows. If `prisma migrate dev` reports drift against unrelated unmerged branch state (spec 33/34's precedent, both currently unmerged per `progress-tracker.md`), fall back to the same hand-applied `prisma db execute` + `prisma migrate resolve --applied` procedure spec 34 already used and documented, rather than a destructive `migrate reset`.
- `trigger/generate-spec.ts` (modified):
  - Import `generateIacSkeleton` alongside `generateSpecMarkdown` and `uploadSpecIac` alongside `uploadSpecMarkdown`.
  - `persistGeneratedSpec` signature changes to `persistGeneratedSpec(projectId: string, markdown: string, terraform: string): Promise<string>`. New sequence: create one placeholder `ProjectSpec` row (`data: { projectId, filePath: "" }` — `iacFilePath` is omitted here, so it defaults to Prisma's implicit `null` for an unset nullable column, not a second placeholder value to invent) → upload the Markdown (`uploadSpecMarkdown`) → upload the Terraform (`uploadSpecIac`), using the same `spec.id` for both → **one** `prisma.projectSpec.update` call setting `{ filePath, iacFilePath }` together, per the raw spec's own literal "set it in the same update call that sets filePath" instruction. If either upload or the single update call throws, the existing catch-and-cleanup branch (best-effort `delete` of the placeholder row, then rethrow) is unchanged in shape — it now just guards a wider span of work, not a new code path.
  - `runGenerateSpec`: after `generateSpecMarkdown` succeeds, call `generateIacSkeleton({ nodes, edges })` with the same `nodes`/`edges` already validated — both calls stay inside the same existing `try` block (no new `try`/`catch`), so a Terraform-generation failure fails the whole run through the exact same error/status-broadcast path a Markdown-generation failure already uses (raw spec's own explicit instruction; also this spec's Notes section). Add one new `setGenerateSpecStatus("processing", ...)` call between the two generation calls (e.g. "Ghost AI is drafting the Terraform skeleton…"), matching the existing per-step status granularity (`start` → `processing` × N → `complete`) rather than silently skipping a status update for a whole new generation step — see Open Questions #1.
  - `GenerateSpecPayload`/`GenerateSpecPayloadSchema`/`GenerateSpecResult` are otherwise unchanged — no new input field. `GenerateSpecResult` gains an optional convenience `terraform: string` field (mirroring the existing `markdown: string` field's "returned as task output for convenience, also durably persisted" precedent) — see Open Questions #2 for why this is a recommendation, not a hard requirement.
- `app/api/projects/[projectId]/specs/[specId]/download-iac/route.ts` (new) — mirrors `download/route.ts` exactly: same `getProjectAccess` gate, same `accessErrorResponse` mapping (401/404/403), same "spec not found" 404 when the `specId` doesn't exist or belongs to a different project. Selects `iacFilePath` (not `filePath`) from the `ProjectSpec` row. New case this route has that the Markdown route doesn't: `iacFilePath` can be `null` (a spec generated before this feature shipped) — treated as a 404 (`"IaC content not found"`), same "nothing usable is there" posture `fetchSpecMarkdown`/`fetchSpecIac` already use for a missing blob, not a 500. Otherwise identical failure precedence: 401 → 404 (project) → 403 → 404 (spec not found) → 404 (no IaC / blob missing) → 500 (genuine upstream failure). Response: `Content-Type: text/plain; charset=utf-8`, `Content-Disposition: attachment; filename="spec-{specId}.tf"` (both exactly as specified in the raw spec text).
- `app/api/projects/[projectId]/specs/route.ts` (modified) — the list response's per-spec shape gains `hasIac: boolean` (`spec.iacFilePath !== null`), **never** the raw `iacFilePath` value itself — same "never a raw Blob URL in a response body" convention this route and the download routes already follow for `filePath`. Needed so the Specs tab can tell a pre-existing spec (no Terraform ever generated, would 404 if downloaded) from one generated after this feature shipped — see Open Questions #3.
- `hooks/use-project-specs.ts` (modified) — `ProjectSpecSummary` gains `hasIac: boolean`, matching the list route's new field.
- `components/editor/specs-tab.tsx` (modified) — each spec list item's existing single `<a href download>` Markdown-download icon button gets a second, adjacent one pointed at `` `/api/projects/${projectId}/specs/${spec.id}/download-iac` `` (same `<a href download>` pattern, same `buttonVariants({ variant: "ghost", size: "icon-sm" })` styling, a distinct icon so the two aren't visually identical — e.g. `FileCode`/`Terminal` from `lucide-react`, `sr-only` label "Download {spec.filename} as Terraform"). Disabled (via the shadcn `Button`'s native `disabled` — not omitted entirely) when `spec.hasIac` is `false`, so a legacy spec's row shows *why* Terraform isn't available (a visibly inert control) rather than a live link that 404s on click — mirroring spec 20's original "visually-disabled download icon button" precedent for an unavailable artifact.

### Acceptance criteria

1. `ProjectSpec.iacFilePath` is a nullable `String?` field in `prisma/schema.prisma`, with a real, applied, additive-only migration. Every `ProjectSpec` row created before this migration has `iacFilePath: null`.
2. Generating a spec (the existing "Generate Spec" button/`POST /api/ai/spec` → `generate-spec` trigger task, unchanged entry point) also produces a Terraform skeleton, uploads it to Blob at `specs/{projectId}/{specId}.tf`, and sets `ProjectSpec.iacFilePath` in the same database update call that sets `filePath`.
3. If Terraform generation (Gemini call) or its Blob upload fails, the entire `generate-spec` run fails — the placeholder `ProjectSpec` row is deleted (mirroring the existing Markdown-failure cleanup), no partial row (e.g. `filePath` set but `iacFilePath` missing) is ever left behind, and the run's status/error path is the existing single one, not a second one.
4. If Markdown generation fails, Terraform generation is never attempted (the existing "Terraform only runs after Markdown succeeds" sequencing) — no wasted Gemini call, no orphaned Terraform blob upload.
5. `GET /api/projects/[projectId]/specs/[specId]/download-iac` requires the same owner-or-collaborator access as the existing Markdown download route, returns `Content-Type: text/plain; charset=utf-8` and `Content-Disposition: attachment; filename="spec-{specId}.tf"`, and returns non-empty plain text for a spec generated after this feature shipped.
6. `GET /api/projects/[projectId]/specs/[specId]/download-iac` returns 404 (not 500, not an empty 200) for a spec whose `iacFilePath` is `null` (generated before this migration).
7. `GET /api/projects/[projectId]/specs` includes a `hasIac` boolean per spec item, and never includes the raw `iacFilePath` value.
8. Each spec list item in the Specs tab shows a working "Download as Terraform" action when `hasIac` is `true`; the same control is visibly present but disabled (not hidden, not a dead 404 link) when `hasIac` is `false`.
9. Existing Markdown generation, persistence, download, and UI behavior are byte-for-byte unaffected for a spec that only has `filePath` set — verified by the pre-existing Markdown-path tests in `trigger/generate-spec.test.ts`, `app/api/projects/[projectId]/specs/[specId]/download/route.test.ts`, and `components/editor/specs-tab.test.tsx` continuing to pass unmodified in behavior (only newly extended, never contradicted).
10. No new AI provider abstraction — `generateIacSkeleton` reuses `lib/generate-spec-ai.ts`'s existing lazy Gemini provider (`getGoogleProvider()`), not a second provider instance or a different SDK call shape.
11. No new "Generate IaC" trigger, button, or route exists anywhere — Terraform generation is only ever reachable as a side effect of the existing "Generate Spec" action.
12. `spec-preview-modal.tsx` is untouched — no Terraform preview/render anywhere in that component; the Terraform artifact is download-only.
13. `trigger/design-agent.ts` and `lib/design-agent-ai.ts` have a zero-line diff.
14. `npm run build` (and this repo's established mechanical gate — `npx tsc --noEmit`, `npx eslint`, `npx vitest run --no-file-parallelism`) all pass.

### Dependencies

- **Spec 27 (Spec Generation Logic)** — `lib/generate-spec-ai.ts`'s lazy-provider pattern, `GenerateSpecGraphNode`/`GenerateSpecGraphEdge`, `trigger/generate-spec.ts`'s `runGenerateSpec`/status-metadata mechanism. Complete.
- **Spec 28 (Spec Persistence & Download)** — `ProjectSpec` Prisma model, `lib/spec-blob.ts`'s upload/fetch pattern, `persistGeneratedSpec`'s placeholder-row-then-upload-then-update pattern, the existing Markdown download route's access-gate/failure-precedence convention (all reused/mirrored, not rebuilt). Complete.
- **Spec 29 (Spec UI Integration)** — `hooks/use-project-specs.ts`, `components/editor/specs-tab.tsx`'s real spec-list rendering (this spec adds a field/button to both, doesn't rebuild them). Complete.
- **Spec 30 (Generate Spec Button)** — the actual "Generate Spec" button wiring / two-call trigger-token sequence in `specs-tab.tsx` that this spec's new persistence step rides on unchanged. Complete.
- **Spec 33 (Custom Templates)** — cited only as the most recent precedent for "add a Prisma model/column, run `prisma migrate dev` against the shared dev database" and its documented drift-handling fallback. Not a functional dependency (no shared code path). PR #30, not yet merged per `progress-tracker.md`.
- **Spec 34 (Public Share Link)** — cited only as the most recent precedent for the drift-handling fallback procedure (`prisma db execute` + `migrate resolve --applied`) if `prisma migrate dev` reports drift again. Not a functional dependency. PR #31, not yet merged per `progress-tracker.md`.

All functional dependencies (27, 28, 29, 30) are Completed per `progress-tracker.md`. Specs 33/34 are cited only for migration-workflow precedent, not code reuse — this spec's own migration (`ProjectSpec.iacFilePath`) is additive and structurally disjoint from both (a different table than spec 33's new `CustomTemplate` model and spec 34's `Project.publicShareToken` column), so it carries no blocking dependency on either PR merging first.

### Open questions

1. **The raw spec text says nothing about an intermediate status message for the new Terraform-generation step** — it only describes the generation/persistence/download mechanics. `trigger/generate-spec.ts` currently publishes exactly four ordered stages (`start`, `processing` ×2, `complete`) via `setGenerateSpecStatus`, one of which ("Ghost AI is drafting the technical spec…") describes only the Markdown call.
   **Recommendation:** add one new `processing` status call between the Markdown and Terraform generation steps (e.g. "Ghost AI is drafting the Terraform skeleton…"), so a run genuinely doing more work also reports more granular progress — consistent with the existing per-step granularity, and low-risk since nothing today asserts an exact stage *count*, only stage *order* (`trigger/generate-spec.test.ts`'s existing assertion is `["start", "processing", "processing", "complete"]`; it becomes `["start", "processing", "processing", "processing", "complete"]`, a test update, not a breaking change to any consumer — no frontend currently reads `useRealtimeRun`'s metadata field for this task, per `architecture-context.md`'s Realtime Conventions section noting "no frontend wiring yet for a Liveblocks broadcast to reach anyway," which applies equally to this metadata channel). Not a hard requirement — if the Senior Developer judges the extra status line unnecessary, omitting it doesn't violate any acceptance criterion above, since no criterion names an exact stage count.

2. **Whether `GenerateSpecResult` (the trigger task's return value) should also carry the generated `terraform` string**, mirroring its existing `markdown: string` field.
   **Recommendation:** add it for structural parity and consistency (`code-standards.md`'s "keep modules small and single-purpose" doesn't argue against this — it's the same field pattern applied to a second generated artifact), but treat it as a nice-to-have, not required: nothing today consumes `realtimeRun.output` on the frontend for this task (per spec 30's brief and the code read for this brief — `specs-tab.tsx`'s completion effect only calls `refetch()`, it never reads `realtimeRun.output.markdown` either), so omitting `terraform` from the result doesn't break any acceptance criterion. Flagging so the Senior Developer makes a deliberate choice either way rather than the field silently drifting out of parity with `markdown`.

3. **The raw spec's own numbered Implementation list never mentions the `GET /api/projects/[projectId]/specs` list route or a `hasIac`-style field** — it only names the download route and the UI's "second download action."
   **Recommendation:** add `hasIac` to the list route regardless (Concrete deliverables above) — without it, the UI has no way to distinguish a legacy spec (download would 404) from one with a real Terraform file, short of either always rendering a live link that sometimes 404s on click, or making a speculative `HEAD`/`GET` request against `download-iac` per list item just to probe availability (both worse than a single boolean already available from the same query that already returns `id`/`createdAt`). This mirrors spec 28's own precedent (its Analyst Brief added a `GET` list route not literally named in that spec's raw text either, for the same "the feature isn't actually usable without it" reasoning) — not new invented scope, the same well-supported pattern this pipeline has already used once on this exact route.

4. **Whether the disabled "Download as Terraform" control should still render for a legacy spec, versus being omitted entirely.** The raw spec's Implementation section says only "Each spec list item gets a second download action... next to the existing Markdown download" — it doesn't address specs that predate this migration (a real, unavoidable case, since the migration doesn't backfill old rows).
   **Recommendation:** render it disabled rather than omitting it (Concrete deliverables above) — consistent visual structure across every list item (a row's layout doesn't shift based on which specs happen to be old), and the disabled state itself communicates "not available for this spec" more clearly than the control's outright absence would. This is a Dev-level UI judgment call within the raw spec's own silence, not a literal requirement — omitting the control entirely for `hasIac: false` would also satisfy every acceptance criterion above and is an acceptable alternative if preferred.

### Out-of-scope callouts

- **Any IaC format other than Terraform** (CloudFormation, Pulumi, CDK, etc.) — explicit Scope Limit in the raw spec text.
- **A new AI provider abstraction** — explicit Scope Limit; `generateIacSkeleton` reuses the existing lazy Gemini provider in `lib/generate-spec-ai.ts` unchanged in kind.
- **A separately triggerable "Generate IaC" action** — explicit Scope Limit; no new button, route, or trigger task. Terraform generation is strictly a side effect of the existing "Generate Spec" action.
- **A Terraform preview/render inside `spec-preview-modal.tsx`** — explicit Scope Limit; download-only, matching the artifact's own plain-text nature (no `react-markdown`-style rendering makes sense for `.tf` content, and none is built).
- **Any change to `trigger/design-agent.ts` or `lib/design-agent-ai.ts`** — explicit Scope Limit; the design agent's action-generation pipeline is untouched.
- **Backfilling `iacFilePath` for pre-existing `ProjectSpec` rows** — not requested anywhere in the raw spec text, and there is no real Terraform content to backfill it with (the graph state at the time of an old spec's generation isn't retained anywhere retrievable). Old rows simply keep `iacFilePath: null` going forward; see Open Questions #4 for how the UI reflects that.
- **Validating, linting, or `terraform plan`/`terraform apply`-ing the generated skeleton** — the raw spec explicitly frames this as "a starting skeleton, not production IaC... no real provider credentials or apply-ready state." No `.tf` syntax validation of any kind is built.
- **Rate limiting specific to spec generation now covering two AI calls instead of one** — `lib/rate-limit.ts` (spec 31) counts `TaskRun` rows per user per rolling window, keyed on the *run*, not the number of Gemini calls a single run happens to make internally; a `generate-spec` run that now makes two sequential Gemini calls instead of one is still exactly one `TaskRun` row, so spec 31's existing behavior is unaffected without any change to `lib/rate-limit.ts`, `app/api/ai/spec/route.ts`, or its tests.
- **Billing, enterprise permission tiers, versioned spec history, production object storage migration, mobile apps** — `project-overview.md`'s Out of Scope wall; none of this spec's work touches any of them.

Brief ready for Senior Developer at `context/spec-status/35-iac-export.md`.

## Dev Notes

Branch: `spec/35-iac-export`, up to date with `main` (`9db59ca`, which already includes specs 32/33/34 merged) — no rebasing or drift-fallback procedure was needed; `prisma migrate dev` applied cleanly against the shared dev database on the first try (`prisma migrate status` reported "up to date" both before and after).

### Files added

- `app/api/projects/[projectId]/specs/[specId]/download-iac/route.ts` — new `GET` route, mirrors `download/route.ts` exactly (same `getProjectAccess` gate, same 401/404/403 precedence, same "spec not found" 404). Selects `iacFilePath` instead of `filePath`; returns 404 (not 500/empty-200) when `iacFilePath` is `null`. `Content-Type: text/plain; charset=utf-8`, `Content-Disposition: attachment; filename="spec-{specId}.tf"`.
- `app/api/projects/[projectId]/specs/[specId]/download-iac/route.test.ts` — full test coverage mirroring `download/route.test.ts`'s cases, plus the new `iacFilePath === null` → 404 case.
- `prisma/migrations/20260825054109_add_project_spec_iac_file_path/migration.sql` — additive-only `ALTER TABLE "ProjectSpec" ADD COLUMN "iacFilePath" TEXT;`, created and applied live via `prisma migrate dev`.

### Files changed

- `lib/generate-spec-ai.ts` — added `GenerateIacInput`, `buildIacPrompt`, `generateIacSkeleton`. Reuses the same cached `getGoogleProvider()`/`GEMINI_MODEL_ID`, same `generateText` call shape, same `maxOutputTokens: 8192`, no retry — a verbatim structural mirror of `generateSpecMarkdown`/`buildPrompt`. Prompt instructs the model to infer a plausible Terraform resource type per node from its `label`/`shape`, no real credentials, no apply-ready state, plain-text response only (no code fence), and a short "canvas is empty" comment fallback for an empty graph.
- `lib/generate-spec-ai.test.ts` — added a full `describe("generateIacSkeleton", ...)` block (missing-key, provider-reuse/cache verification against the same call already made by `generateSpecMarkdown` in one test, raw-text passthrough, graph-summary-in-prompt, plain-text/no-code-fence instruction, empty-graph fallback wording, upstream-failure propagation).
- `lib/spec-blob.ts` — added `iacBlobPathname`, `uploadSpecIac` (`contentType: "text/plain"`, otherwise identical to `uploadSpecMarkdown`), `fetchSpecIac` (identical shape/semantics to `fetchSpecMarkdown`). Kept fully parallel/duplicated rather than parameterizing the existing Markdown functions, per the brief's explicit instruction not to touch spec 28's shipped code.
- `lib/spec-blob.test.ts` — added parallel test blocks for `iacBlobPathname`/`uploadSpecIac`/`fetchSpecIac`, mirroring the existing Markdown blocks' cases exactly.
- `prisma/schema.prisma` — `ProjectSpec.iacFilePath String?` (nullable), documented inline with the same reasoning as the brief (no backfill, `null` means "never generated").
- `trigger/generate-spec.ts` — `persistGeneratedSpec` now takes `(projectId, markdown, terraform)`: create placeholder → `uploadSpecMarkdown` → `uploadSpecIac` (same `spec.id` for both) → **one** `prisma.projectSpec.update` setting `{ filePath, iacFilePath }` together. The existing catch-and-cleanup (best-effort placeholder delete + rethrow) now guards the wider span unchanged in shape. `runGenerateSpec` calls `generateIacSkeleton({ nodes, edges })` right after `generateSpecMarkdown` succeeds, inside the same `try` block (no new `try`/`catch`) — a Terraform-generation or -upload failure fails the whole run through the exact same error/status/cleanup path a Markdown failure already used. Added one new `"processing"` status call ("Ghost AI is drafting the Terraform skeleton…") between the Markdown and Terraform steps, per Open Questions #1's recommendation — the stage sequence is now `start, processing, processing, processing, complete`. `GenerateSpecResult` gained `terraform: string`, per Open Questions #2's recommendation (structural parity with `markdown`).
- `trigger/generate-spec.test.ts` — updated mocks (`generateIacSkeleton`, `uploadSpecIac`), updated the stage-sequence assertion, updated the persistence assertions to check the single combined `update` call, and added new cases: Terraform generation failing (never persists, never calls `generateIacSkeleton` is checked in the Markdown-failure case and vice versa), Terraform generation running only after Markdown resolves (explicit call-order test), Terraform Blob upload failing (placeholder cleanup, `update` never called), and the combined-update-call failure case.
- `app/api/projects/[projectId]/specs/route.ts` — `select` now includes `iacFilePath`; response gains `hasIac: spec.iacFilePath !== null` per item. Raw `iacFilePath` is never returned.
- `app/api/projects/[projectId]/specs/route.test.ts` — updated the list-shape test to assert `hasIac` per item (mixed `true`/`false` fixture) and the updated `select` clause.
- `hooks/use-project-specs.ts` — `ProjectSpecSummary` gained `hasIac: boolean`.
- `hooks/use-project-specs.test.ts` — fixtures updated to include `hasIac` (no behavioral change to the hook itself, which just passes the server response through).
- `components/editor/specs-tab.tsx` — each spec list item now renders a second download action next to the Markdown one: a real `<a href download>` pointed at `download-iac` (distinct icon, `FileCode` from `lucide-react`, `sr-only` label "Download {filename} as Terraform") when `spec.hasIac` is `true`; a visibly-present, natively `disabled` shadcn `Button` (same icon/label, not a link) when `false` — per Open Questions #4's recommendation, so a legacy spec's row shows *why* Terraform isn't available rather than omitting the control or shipping a live 404-prone link.
- `components/editor/specs-tab.test.tsx` — added a new `describe` block covering both the enabled-link and disabled-button paths for the new Terraform action. Left the pre-existing `SPECS` fixture (no `hasIac` field, so falsy → disabled path) untouched, so every pre-existing test in this file — including the one asserting exactly 2 download `link`s — continues to pass unmodified in behavior (acceptance criterion 9).
- `components/editor/spec-preview-modal.test.tsx` — added `hasIac: false` to its `ProjectSpecSummary` test fixture (type-only fix, `ProjectSpecSummary` gained a required field); the component itself (`spec-preview-modal.tsx`) has a zero-line diff, confirmed via `git diff`.

### Skills used

None of the installed `.claude/skills/` entries applied directly — this spec extends an already-established Gemini `generateText` pattern (`lib/generate-spec-ai.ts`) and an already-established Vercel Blob upload/fetch pattern (`lib/spec-blob.ts`) rather than introducing new Prisma query shapes, Trigger.dev agent patterns, Clerk usage, or Liveblocks usage beyond what spec 27/28 already established. `prisma-cli` guidance (plain `prisma migrate dev`) was followed implicitly but the skill itself wasn't loaded, since no drift was encountered and the brief's own fallback procedure (already documented from specs 33/34) wasn't needed.

### Key decisions

- **Open Questions #1 (intermediate status message)**: added it — one new `"processing"` stage between Markdown and Terraform generation, updating the existing stage-sequence test from 4 to 5 entries. The brief flagged this as optional; added for genuine progress-reporting parity with the extra work now being done.
- **Open Questions #2 (`GenerateSpecResult.terraform`)**: added it, for structural parity with the existing `markdown` field. Nothing on the frontend currently reads `realtimeRun.output` for this task (confirmed by re-reading `specs-tab.tsx`'s completion effect, which only calls `refetch()`), so this is inert today but keeps the two generated-artifact fields symmetric for a future consumer.
- **Open Questions #3 (`hasIac` on the list route)**: added, exactly as recommended — without it there's no way to tell a legacy spec from a Terraform-capable one without a live 404-prone link or a speculative probe request.
- **Open Questions #4 (disabled control vs. omitted)**: rendered disabled rather than omitted, using a real shadcn `Button` (native `disabled`) rather than an `<a>` with `aria-disabled` — an anchor has no native disabled state, so the enabled/disabled branches render genuinely different elements (`<a href download>` vs `<Button disabled>`), both sharing the same icon/label/sizing for visual consistency.

### Test coverage

New/extended: `lib/generate-spec-ai.test.ts` (+8 tests for `generateIacSkeleton`), `lib/spec-blob.test.ts` (+9 tests for `iacBlobPathname`/`uploadSpecIac`/`fetchSpecIac`), `trigger/generate-spec.test.ts` (stage-count and persistence assertions updated, +5 new cases), `app/api/projects/[projectId]/specs/[specId]/download-iac/route.test.ts` (new, 9 tests, mirrors the Markdown download route's suite), `app/api/projects/[projectId]/specs/route.test.ts` (updated to assert `hasIac`), `components/editor/specs-tab.test.tsx` (+2 tests for the enabled/disabled Terraform action), `hooks/use-project-specs.test.ts` and `components/editor/spec-preview-modal.test.tsx` (fixtures updated for the new required `hasIac` field, no behavioral change).

Commands run, all green:
- `npx prisma migrate dev --name add_project_spec_iac_file_path` — applied cleanly, no drift.
- `npx prisma generate` — regenerated the client (needed after the schema change; the stale-client symptom from the recorded project memory showed up transiently as `tsc` errors on `iacFilePath`/`customTemplate` until this ran).
- `npx tsc --noEmit` — clean.
- `npx eslint` on every file this diff touches — clean (0 errors, 0 warnings). A full-repo `npx eslint .` run shows one pre-existing error (`components/editor/editor-shell.tsx`, `react-hooks/set-state-in-effect`) and one pre-existing warning (an unrelated `.agents/skills/` template file) — both confirmed pre-existing via `git status`/`git diff` showing neither file touched by this branch.
- `npx vitest run --no-file-parallelism` — 818/818 tests passing across 80/80 files (up from 707/73 at the branch point after spec 34).
- `npx next build` — succeeds; `/api/projects/[projectId]/specs/[specId]/download-iac` appears in the route listing as a new dynamic route.
- `npx prisma migrate status` — "Database schema is up to date!", 7 migrations found.

### Known limitations / deferrals

- No live smoke test against a real Gemini key / Trigger.dev worker was performed in this environment (no running dev server / real Trigger.dev worker here) — recommended as a human smoke test: click "Generate Spec" on a real project, confirm both a `.md` and `.tf` file are downloadable afterward, and confirm a legacy (pre-migration) spec's Terraform button renders disabled.
- No `.tf` syntax validation of any kind is performed anywhere — explicit Scope Limit, honored as specified (this is a starting skeleton, not apply-ready IaC).
- Consistent with the brief's own Out-of-scope callouts: no CloudFormation/Pulumi/CDK support, no new AI provider abstraction, no separate "Generate IaC" trigger/button/route, no Terraform preview/render in `spec-preview-modal.tsx` (confirmed zero-line diff), no backfill of `iacFilePath` for pre-existing rows, and `trigger/design-agent.ts`/`lib/design-agent-ai.ts` both have a zero-line diff (confirmed via `git diff --stat`).

## QA Report

**Overall verdict: PASS**

### Mechanical gate

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS — clean, no errors |
| `npx eslint .` | PASS — 0 errors/warnings in this diff's files. Full-repo run shows 1 pre-existing error (`components/editor/editor-shell.tsx`, `react-hooks/set-state-in-effect`) and 1 pre-existing warning (`.agents/skills/.../__root.tsx`); independently confirmed via `git diff main...spec/35-iac-export -- <file>` that neither file appears in this branch's diff — both are pre-existing, unrelated to this spec |
| `npx vitest run --no-file-parallelism` | PASS — 818/818 tests, 80/80 files |
| `npx next build` | PASS — succeeds; `/api/projects/[projectId]/specs/[specId]/download-iac` appears as a new dynamic route in the output |
| `npx prisma migrate status` | PASS — "Database schema is up to date!", 7 migrations found |

All Dev Notes claims about the mechanical gate were independently reproduced and confirmed accurate.

### Acceptance criteria checklist

1. **PASS** — `prisma/schema.prisma` has `iacFilePath String?` (nullable) on `ProjectSpec`; migration `20260825054109_add_project_spec_iac_file_path/migration.sql` is exactly `ALTER TABLE "ProjectSpec" ADD COLUMN "iacFilePath" TEXT;` — additive, no `NOT NULL`, no default, no index.
2. **PASS** — `trigger/generate-spec.ts#persistGeneratedSpec` uploads both Markdown and Terraform under the same placeholder `spec.id`, then a single `prisma.projectSpec.update` call sets `{ filePath, iacFilePath }` together. Verified in code and in `trigger/generate-spec.test.ts`'s persistence assertions.
3. **PASS** — `runGenerateSpec` keeps both generation calls and `persistGeneratedSpec` inside one `try` block; a Terraform-generation or -upload failure hits the same catch, deletes the placeholder row, and rethrows. Verified against dedicated tests: "never persists anything when Terraform generation fails", "deletes the placeholder row and rethrows when the Terraform Blob upload fails", "deletes the placeholder row and rethrows when the combined filePath+iacFilePath update fails" — all present and passing.
4. **PASS** — `generateIacSkeleton` is called only after `generateSpecMarkdown` resolves (sequential `await`s in `runGenerateSpec`); confirmed by the explicit call-order test and the "never persists ... never calls generateIacSkeleton" Markdown-failure test.
5. **PASS** — `download-iac/route.ts` uses the same `getProjectAccess` gate/401-404-403 precedence as `download/route.ts`; returns `Content-Type: text/plain; charset=utf-8` and `Content-Disposition: attachment; filename="spec-{specId}.tf"`; returns the fetched Terraform text for a valid spec (verified by test + code read).
6. **PASS** — `iacFilePath === null` short-circuits to a 404 ("IaC content not found") before ever calling `fetchSpecIac`, distinct from the 200/500 paths. Verified in code and in the dedicated null-path test.
7. **PASS** — `GET /api/projects/[projectId]/specs` selects `iacFilePath` only to derive `hasIac: spec.iacFilePath !== null` in the response map; the raw `iacFilePath` value is never included in the returned object.
8. **PASS** — `specs-tab.tsx` renders a real `<a href download>` Terraform link when `spec.hasIac` is `true`, and a visibly-present, natively `disabled` shadcn `Button` (same icon/label) when `false`. Verified by the two new tests in `specs-tab.test.tsx`.
9. **PASS** — the pre-existing `SPECS` fixture in `specs-tab.test.tsx` (no `hasIac` field) is untouched, and the pre-existing "exactly 2 download links" assertion (`downloadLinks.toHaveLength(2)`) still passes unmodified, since the disabled Terraform control renders as a `<button>`, not matched by `getByRole("link")`. `trigger/generate-spec.test.ts`'s Markdown-only assertions and `download/route.test.ts` (unmodified per `git diff --stat`) both continue to pass.
10. **PASS** — `generateIacSkeleton` calls the same `getGoogleProvider()` function `generateSpecMarkdown` uses; a dedicated test (`"reuses the same cached, lazily-instantiated Google provider as generateSpecMarkdown..."`) asserts `createGoogleGenerativeAIMock` is called exactly once across both functions.
11. **PASS** — no new trigger task, button, or route exists for IaC generation independent of "Generate Spec"; confirmed by reading `specs-tab.tsx` (single `handleGenerateSpec` handler) and the full diff stat.
12. **PASS** — `spec-preview-modal.tsx` has a zero-line diff (`git diff main...spec/35-iac-export -- components/editor/spec-preview-modal.tsx` produces no output); only its test fixture file was touched for a required-field type update.
13. **PASS** — `trigger/design-agent.ts` and `lib/design-agent-ai.ts` both have a zero-line diff, confirmed via `git diff --stat`.
14. **PASS** — `npx tsc --noEmit`, `npx eslint`, `npx vitest run --no-file-parallelism`, and `npx next build` all pass, independently reproduced above.

### Architecture invariants

- No long-running AI work in a request handler — both Gemini calls stay inside `trigger/generate-spec.ts`'s background task; `download-iac/route.ts` only reads already-persisted content. OK.
- Metadata (`iacFilePath`, a URL) vs. blob storage (Terraform content itself) kept separate — the Prisma column stores only the Blob URL, never the `.tf` content. OK.
- Auth/ownership enforced at every mutation boundary — `download-iac` reuses the same `getProjectAccess` gate as every other project route; no new mutation route was added by this spec. OK.
- No violation found.

### Standards compliance spot-check

- No `any` introduced in non-test diff lines (checked via `grep -nE '\bany\b'` across the diff, excluding test files — only a false-positive match on the English word "any" in a test name and a prompt string).
- No raw Tailwind color classes (`zinc-`, `slate-`) or hex literals introduced in the diff (`grep` came back empty).
- `components/ui/*` untouched — not present in the diff stat.
- New `download-iac/route.ts` follows the thin-route/shared-module convention (`fetchSpecIac` lives in `lib/spec-blob.ts`).

### Error handling

- Missing `iacFilePath` (legacy spec): 404, not 500/empty-200 — verified.
- Missing/expired Blob content: 404 via `fetchSpecIac`'s `null` return — verified.
- Genuine upstream Blob failure: 500, not masked as 404 — verified.
- Unauthenticated/forbidden/project-not-found: 401/403/404 via the shared `getProjectAccess` gate, same precedence as the Markdown route — verified.
- Missing `GEMINI_API_KEY`: `generateIacSkeleton` throws a handled, legible error before calling the provider — verified by test.
- Terraform generation/upload failure mid-run: whole run fails, placeholder row cleaned up, no partial `filePath`-only row — verified by test.

### Housekeeping

- `context/progress-tracker.md` updated: Phase 34 entry text corrected (link to run-stop note removed since the run continued), a new Phase 35 "In Progress" summary entry added, "Current Goal" updated, and a detailed "In Progress" bullet list added — accurately reflects what was built and correctly flags spec 35 as not yet QA'd/PO-reviewed. No premature "Completed" claim.

### Issues found

None.

**QA passed — ready for Product Owner review.**

## Product Owner Review (round 1)

**Verdict: PASS — ready for human review**

### Independent re-verification (not trusting Dev/QA claims at face value)

Read `context/project-overview.md`, the full spec-status file (Analyst Brief, Dev Notes, QA Report), the raw spec at `context/feature-specs/35-iac-export.md`, and `context/progress-tracker.md`. Then independently re-derived the diff rather than accepting Dev Notes' file list:

- `git diff --stat main...spec/35-iac-export` — 19 files changed, matches Dev Notes' file list exactly (no undisclosed file touched).
- `git diff main...spec/35-iac-export -- trigger/design-agent.ts lib/design-agent-ai.ts components/editor/spec-preview-modal.tsx` — **empty output**. All three files genuinely have a zero-line diff, confirming acceptance criteria 12/13 directly rather than trusting the claim.
- `prisma/schema.prisma` diff — `iacFilePath String?` added as the only schema change, nullable, no default, no index. The migration file (`20260825054109_add_project_spec_iac_file_path/migration.sql`) is exactly `ALTER TABLE "ProjectSpec" ADD COLUMN "iacFilePath" TEXT;` — additive-only, no `NOT NULL`, no default, cannot fail or misrepresent any pre-existing `ProjectSpec` row. Every row created before this migration reads `iacFilePath: null` with no backfill attempted or needed.
- `download-iac/route.ts` read in full — same `getProjectAccess` gate and 401/404/403 precedence as the Markdown download route; explicitly short-circuits to a 404 ("IaC content not found") when `iacFilePath === null`, before ever attempting a Blob fetch — never a 500 or empty-200 for a legacy spec.
- `trigger/generate-spec.ts` diff read in full — `persistGeneratedSpec` creates one placeholder row, uploads Markdown then Terraform under the same `spec.id`, and sets `{ filePath, iacFilePath }` in a single combined `update` call. The `catch` block deletes the placeholder row entirely (best-effort) on any failure in that span and rethrows — confirmed there is no code path that can leave a row with `filePath` set and `iacFilePath` missing, or vice versa. `runGenerateSpec` calls `generateIacSkeleton` only after `generateSpecMarkdown` resolves, both inside the same `try` block — a Terraform failure fails the whole run through the exact same error/cleanup path a Markdown failure already used.
- `lib/generate-spec-ai.ts` / `lib/spec-blob.ts` diffs read in full — `generateIacSkeleton` calls the same `getGoogleProvider()`/`GEMINI_MODEL_ID` as `generateSpecMarkdown` (no second provider instance), same `maxOutputTokens: 8192`, no retry logic. `uploadSpecIac`/`fetchSpecIac`/`iacBlobPathname` are structurally parallel to, not merged into, the existing Markdown functions — spec 28's shipped code is untouched.
- `app/api/projects/[projectId]/specs/route.ts` diff — `hasIac: spec.iacFilePath !== null` added to the response map; the raw `iacFilePath` value is never included, matching this route's existing "never a raw Blob URL in a response body" convention for `filePath`.
- `components/editor/specs-tab.tsx` diff — a real `<a href download>` Terraform link renders when `spec.hasIac` is true; a visibly-present, natively `disabled` shadcn `Button` (not an omitted control, not a live 404-prone link) renders when false, so a legacy spec's row communicates *why* Terraform isn't available.

### Scope fit against `project-overview.md`

- **Out of Scope wall**: touches none of it. No billing/subscription, no new permission tier, no versioned spec history, no production object-storage migration, no mobile app. This is a second Blob-stored artifact on the same `ProjectSpec` row using the identical private-Blob-plus-Prisma-metadata pattern spec 28 already established — not a new storage architecture.
- **In Scope fit**: sits squarely inside the already-in-scope "AI-powered Markdown spec generation from the canvas graph" / "Persistent storage for project metadata and generated artifacts" / "Spec download" lines — this is the same generation-and-download pipeline extended to a second artifact type, not a new feature surface with its own entry point. There is no new trigger task, no new "Generate IaC" button, and no independent way to invoke Terraform generation outside the existing "Generate Spec" action — verified directly in `specs-tab.tsx` (single `handleGenerateSpec` handler, unchanged) and the full diff stat (no new trigger file).
- **Success Criteria**: doesn't literally strengthen Success Criterion 5 ("graph -> persisted Markdown spec") since the Markdown path is byte-for-byte unaffected (confirmed via the untouched `download/route.ts`, unmodified per `git diff --stat`, and Dev/QA's shared claim that the pre-existing Markdown test suites pass unmodified in behavior). It does support Success Criterion 6 ("Project metadata and generated artifacts are stored in the correct layers") — a second generated-artifact class (Terraform text) is stored using the exact same Blob-URL-in-Postgres, never-raw-URL-in-response discipline the Markdown artifact already uses, reinforcing rather than diluting that criterion's intent. Consistent with the precedent set in spec 34's own Product Owner review (public share link also didn't map to a numbered Success Criterion directly and was accepted as legitimate additive product surface rather than disqualified) — the same reasoning applies here: a narrowly-scoped, opt-in-by-nature (rides on an already-existing action), non-breaking addition to an already-in-scope feature area.

### Nullable migration / `hasIac` gating — legacy-row safety

Confirmed directly (not just via Dev/QA's description) that the migration cannot break any existing `ProjectSpec` row: `iacFilePath` is nullable with no default and no `NOT NULL`, so every pre-migration row silently reads `null` with zero data-loss risk or migration-failure risk. `hasIac` is derived purely from that nullability at the list route, and both the UI and the download route treat `null`/`false` as "not available" (disabled control, 404 not 500/empty-200) rather than a broken or ambiguous state. This is the same nullable-first-then-additive-migration discipline used in spec 33/34, applied correctly here.

### Rough edges — acceptable at this stage

- No live smoke test against a real Gemini key / Trigger.dev worker (disclosed by Dev, confirmed reasonable for this environment) — recommended, not blocking, per `ai-workflow-rules.md`'s incremental philosophy.
- No `.tf` syntax validation — explicit Scope Limit in the raw spec, correctly honored, not a gap.
- `GenerateSpecResult.terraform` and the new intermediate status message are both currently inert (no frontend consumer reads `realtimeRun.output` or the status metadata for this task) — flagged transparently in both the raw spec's Open Questions and Dev Notes, structurally symmetric with the existing `markdown` field, and does not block anything a later spec would need to build on.

None of the above would block a later spec from building on this one correctly — the storage/metadata contract (`iacFilePath`, `hasIac`, `download-iac`) is complete and self-consistent as shipped.

### `progress-tracker.md` accuracy

QA's Housekeeping section correctly notes the tracker was left at "In Progress" (Dev complete, awaiting QA) with no premature "Completed" claim — accurate as of the QA handoff. Updating it now to move Phase 35 to Completed, reflecting QA PASS and this Product Owner PASS, and advancing "Current Goal" to spec 36. A PR has not been opened as of this review — opening it is a separate step per this task's explicit instructions, so the tracker entry notes it as pending rather than fabricating a PR link.

**Recommendation: PASS — ready for human review.** This is a legitimate, narrowly-scoped, additive extension of the existing generate-spec pipeline. It does not cross any Out of Scope boundary, reuses every existing pattern (lazy Gemini provider, Blob upload/fetch, placeholder-create-then-upload-then-update persistence, access-gated download route) rather than inventing new ones, and correctly protects every pre-existing `ProjectSpec` row via a nullable, additive-only migration with consistent `null`-means-unavailable handling end to end (schema -> persistence -> list route -> UI -> download route).
