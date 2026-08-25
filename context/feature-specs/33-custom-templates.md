Let a user save their current canvas as a reusable template, lifting spec 18's explicit "no template saving / no custom user templates / no server persistence" scope limits.

### Implementation

1. Persistence

Add a `CustomTemplate` model to `prisma/schema.prisma`: `id`, `ownerId` (Clerk user ID — templates are private to the saving user, not project-scoped), `name`, `description`, `filePath` (Blob URL), `createdAt`. Create and apply a real migration.

Create `lib/template-blob.ts`, mirroring `lib/canvas-blob.ts`/`lib/spec-blob.ts`'s exact shape (`requireBlobToken`, `access: "private"`). Store the template's node/edge JSON at `templates/{ownerId}/{templateId}.json`.

2. API

Create `app/api/templates/route.ts`:
- `GET`: list the current user's own `CustomTemplate` rows (auth required, no project access check — these aren't project-scoped).
- `POST`: accept `{ name, description, nodes, edges }`, validate with Zod, upload to Blob, create the `CustomTemplate` row.

Create `app/api/templates/[templateId]/route.ts`:
- `DELETE`: owner-only (the `CustomTemplate.ownerId` must match the caller).
- `GET`: fetch one template's node/edge JSON (for import) — owner-only, same as delete.

3. Save flow

Add a "Save as template" action to `components/editor/canvas-control-bar.tsx`, next to the existing export-as-image action. It opens a small save dialog (name + optional description, shadcn `Dialog`) and calls `POST /api/templates` with the current canvas's live `nodes`/`edges` (the same graph state `canvas.tsx`'s `onCanvasGraphChange` already pushes up per spec 30).

4. Import flow

Extend `components/editor/starter-templates-modal.tsx` with a "My Templates" section, listing the current user's saved `CustomTemplate` rows (fetched via a new `hooks/use-custom-templates.ts`, mirroring `hooks/use-project-specs.ts`) alongside the existing built-in `CANVAS_TEMPLATES` grid. Selecting a saved template fetches its node/edge JSON and imports it through the exact same replace-canvas flow spec 18 already built — no new import mechanism. Add a delete action per saved template card.

### Scope Limits

- Do not add sharing of a saved template with other users — private to the owner only.
- Do not add editing an existing saved template — delete and re-save only.
- Do not modify the built-in `CANVAS_TEMPLATES` array or its preview rendering in `starter-templates.ts`.
- Do not touch `components/editor/canvas.tsx`'s export-as-image logic.
- Note: `components/editor/starter-templates-modal.tsx` may already have local uncommitted changes in this working tree from unrelated work — check `git diff` on this file before starting so this spec's changes land on top of the current state deliberately, not by accident.

### Notes

- Follow `app/api/projects/[projectId]/specs/route.ts` (spec 28) as the closest precedent for a Zod-validated, Blob-backed, list+create route pair.
- A `CustomTemplate` needs no `projectId` — it belongs to a user, not a project, since the whole point is reusing a design across projects.

### Check When Done

- A user can save their current canvas as a named template.
- Saved templates appear under "My Templates" in the starter templates modal, visible only to the user who saved them.
- Importing a saved template replaces the canvas identically to importing a built-in one (spec 18's existing behavior).
- Deleting a saved template removes it from the list and from Blob storage.
- `npm run build` passes.
