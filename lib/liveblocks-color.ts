/**
 * Fixed cursor-color palette for Liveblocks presence. Not sourced from any
 * existing token file — `ui-context.md`'s `NODE_COLORS` is scoped to canvas
 * nodes, not presence cursors (see spec 10's Open Questions #3) — so this is
 * a small, locally chosen set of visually distinct, dark-background-legible
 * hex values.
 */
const CURSOR_COLORS = [
  "#00C8D4",
  "#6457F9",
  "#F75F8F",
  "#FF990A",
  "#62C073",
  "#52A8FF",
  "#BF7AF0",
  "#FF6166",
] as const;

/**
 * Deterministically maps a user ID to one color from `CURSOR_COLORS`.
 *
 * Pure function — no randomness, no per-call state — so the same user ID
 * always resolves to the same color, both across sessions for that user and
 * consistently for every other client observing their cursor/badge.
 */
export function getCursorColor(userId: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) | 0;
  }

  const paletteIndex = Math.abs(hash) % CURSOR_COLORS.length;
  return CURSOR_COLORS[paletteIndex];
}
