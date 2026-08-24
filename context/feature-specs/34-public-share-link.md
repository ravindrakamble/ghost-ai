Let a project owner generate a public, unauthenticated read-only link so a stakeholder without an account can view the canvas and latest spec.

### Implementation

1. Schema

Add a nullable `publicShareToken String? @unique` field to the `Project` model in `prisma/schema.prisma`. No token means no public link exists. Create and apply a real migration.

2. API

Create `app/api/projects/[projectId]/public-link/route.ts`:
- `POST`: owner-only (use `lib/projects.ts`'s existing owner-only gate, the same one `PATCH`/`DELETE /api/projects/[id]` use — not `getProjectAccess`, which also allows collaborators). Generates a random token (e.g. `crypto.randomUUID()`), saves it to `Project.publicShareToken`, returns the shareable URL.
- `DELETE`: owner-only. Clears `publicShareToken` back to `null`, revoking the link immediately.

Create `app/api/public/[token]/route.ts`: unauthenticated `GET`. Looks up the `Project` by `publicShareToken`. On a match, fetches the latest canvas snapshot (reuse `lib/canvas-blob.ts`'s existing fetch helper) and the most recent `ProjectSpec` row if any, and returns just enough to render a read-only view — project name, node/edge JSON, spec filename/markdown. Returns 404 for no match (do not distinguish "wrong token" from "link revoked").

3. Public view page

Create `app/share/[token]/page.tsx` — a public route (no Clerk auth check, add it to the auth middleware's public-route allowlist alongside sign-in/sign-up). Fetches from `GET /api/public/[token]` and renders a static, read-only diagram preview using the same lightweight canvas preview approach `starter-templates-modal.tsx` already uses for template cards (draw nodes/edges directly, no live React Flow instance, no Liveblocks room join). Show the latest spec's Markdown below it if one exists (reuse `spec-preview-modal.tsx`'s `react-markdown` rendering approach). No edit affordances anywhere on this page.

4. Share dialog wiring

Extend `components/editor/share-dialog.tsx` (spec 09) with a new "Public link" section, visible only to the owner (`isOwner`, already available from `getProjectAccess`). Generate/copy/revoke the link using the two new API routes, matching the existing "Copied!" feedback convention already used for the collaborator invite link.

### Scope Limits

- Do not join the Liveblocks room for public viewers — render the last persisted snapshot only, not a live view. A public visitor never sees real-time edits.
- Do not allow any mutation from the public page.
- Do not expose collaborator emails or the owner's identity on the public page — project name and diagram/spec content only.
- Do not change how Liveblocks room tokens are issued for authenticated collaborators (`architecture-context.md`'s existing invariant stays: room tokens require verified project membership).
- Collaborators cannot generate or revoke the public link — owner only.

### Notes

- `lib/projects.ts`'s owner-only gate (used by `PATCH`/`DELETE /api/projects/[id]`) is the correct access check here, not `getProjectAccess` — generating/revoking a public link is an ownership-level action, not a collaborator-level one.
- The public page's diagram preview can reuse `starter-templates-modal.tsx`'s existing bounds-fitting/shape-drawing helpers rather than reimplementing them.

### Check When Done

- An owner can generate a public link from the share dialog and copy it.
- Visiting the link while signed out renders a read-only snapshot of the canvas (and the latest spec, if one exists) with no edit controls.
- An owner can revoke the link; visiting it afterward returns a 404.
- A collaborator (non-owner) cannot generate or revoke the link.
- `npm run build` passes.
