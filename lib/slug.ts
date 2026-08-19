export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Generates a short, cosmetically-unique suffix (e.g. `a3f9k2`) for the
 * create-project dialog's live room-ID-style preview. This is display-only —
 * it is never sent to the API and never becomes the real project ID, which
 * the server generates via `cuid()`. See spec 07's Open Questions #2.
 */
export function generateShortSuffix(length = 6): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, length)
}
