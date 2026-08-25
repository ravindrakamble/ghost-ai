Add a way to find and jump to a node by label once a diagram grows past what fits on screen.

### Implementation

1. Search UI

Add a search icon button to `components/editor/canvas-control-bar.tsx`. Clicking it opens a small popover/command list (add a shadcn `Popover` component via this repo's existing base-nova shadcn/ui v4 preset if one doesn't already exist in `components/ui/` — check first) with a text input and a live-filtered list of matching nodes as the user types.

2. Matching

Filter the canvas's current `nodes` array (already available in `CanvasFlow` via `useLiveblocksFlow`) by case-insensitive substring match against each node's label. Show up to a reasonable capped number of results (e.g. 20), ordered by match position (earliest match first) then label.

3. Jump-to-node

Selecting a result uses React Flow's `useReactFlow().setCenter(x, y, { zoom, duration })` (the node's center, computed from its position + width/height, same bounds math `handleExportImage` already uses in `canvas.tsx`) to pan/zoom to it, then closes the popover. Briefly highlight the target node (a short-lived CSS class or inline style toggle on `canvas-node.tsx`, cleared after ~1.5s) so the jump is visually obvious.

### Scope Limits

- Do not add search across multiple projects — current canvas only.
- Do not add edge search — nodes only.
- Do not add keyboard-shortcut activation (e.g. Cmd+K) — a toolbar button only, for this spec.
- Do not modify `canvas-node.tsx`'s drag/edit/select behavior beyond the temporary highlight.

### Notes

- `canvas-control-bar.tsx` already groups related actions with dividers (see the export-as-image addition) — add this as its own group rather than mixing it into an existing one.

### Check When Done

- A search control exists in the canvas control bar.
- Typing filters to matching nodes by label in real time.
- Selecting a result pans/zooms the canvas to center that node and briefly highlights it.
- `npm run build` passes.
