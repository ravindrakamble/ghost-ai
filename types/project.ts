/**
 * Display shape of a project as consumed by the editor sidebar and dialogs.
 *
 * `slug` is intentionally not a field here — it is not a persisted column on
 * the Prisma `Project` model (see `prisma/schema.prisma`). Anywhere the UI
 * needs a slug-style preview (e.g. the create dialog's live room-ID preview)
 * it is derived at render time from `name` via `lib/slug.ts`, not sourced
 * from an API response.
 */
export interface Project {
  id: string
  name: string
}
