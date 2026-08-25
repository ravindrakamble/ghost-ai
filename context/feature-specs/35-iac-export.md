Generate a Terraform skeleton from the canvas graph alongside the existing Markdown spec, reusing the `generate-spec` pipeline rather than building a parallel one.

### Implementation

1. Generation

Modify `lib/generate-spec-ai.ts`. Add `generateIacSkeleton(input: { nodes, edges }): Promise<string>` — a second `generateText` call (same lazy Gemini provider, same `maxOutputTokens: 8192` lesson as `generateSpecMarkdown`) that turns the node/edge structural summary into a plain-text Terraform skeleton (resource blocks per node, sensible types inferred from node labels/shapes, no real provider credentials or apply-ready state — a starting skeleton, not production IaC).

2. Task

Modify `trigger/generate-spec.ts`. After `generateSpecMarkdown` succeeds, also call `generateIacSkeleton` with the same `nodes`/`edges`. Extend `persistGeneratedSpec` to upload the Terraform text to Blob at `specs/{projectId}/{specId}.tf` (alongside the existing `.md` upload) in the same two-write pattern already used for the Markdown file. Add `iacFilePath` to the `ProjectSpec` Prisma model (migration required) and set it in the same update call that sets `filePath`. Treat IaC generation as part of the same atomic run — if it fails, the whole run fails and the placeholder `ProjectSpec` row is cleaned up exactly like a Markdown-generation failure already is.

3. Download route

Create `app/api/projects/[projectId]/specs/[specId]/download-iac/route.ts`, mirroring the existing Markdown download route exactly (same `getProjectAccess` gate, same 404-on-project-mismatch check) but serving `iacFilePath` as `Content-Type: text/plain; charset=utf-8` / `Content-Disposition: attachment; filename="spec-{specId}.tf"`.

4. UI

Modify `components/editor/specs-tab.tsx`. Each spec list item gets a second download action ("Download as Terraform") next to the existing Markdown download, pointed at the new route.

### Scope Limits

- Do not support any IaC format other than Terraform.
- Do not add a new AI provider abstraction — reuse `lib/generate-spec-ai.ts`'s existing lazy-provider pattern.
- Do not make IaC generation separately triggerable from the UI — it's bundled into the existing "Generate Spec" action, not a new button.
- Do not add a Terraform preview/render inside `spec-preview-modal.tsx` — download only, same as this spec's own raw-text nature.
- Do not touch `trigger/design-agent.ts` or `lib/design-agent-ai.ts`.

### Notes

- `GenerateSpecGraphNode`/`GenerateSpecGraphEdge` (already exported from `trigger/generate-spec.ts`) are the exact input both `generateSpecMarkdown` and the new `generateIacSkeleton` need — no new graph-summary type.
- Keep the two generation calls sequential and inside the same `try` block in `runGenerateSpec`, so a failure in either surfaces through the existing single error/status-broadcast path.

### Check When Done

- Generating a spec also produces a Terraform skeleton persisted to Blob and referenced by `ProjectSpec.iacFilePath`.
- Each spec list item has a working "Download as Terraform" action that returns valid, non-empty plain text.
- Existing Markdown generation and download are unaffected.
- `npm run build` passes.
