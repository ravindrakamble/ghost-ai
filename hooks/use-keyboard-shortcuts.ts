"use client"

import { useEffect } from "react"

/**
 * The five actions `CanvasControlBar` already exposes as buttons (spec 17's
 * Analyst Brief, Concrete deliverables) — passed in as plain arguments, not
 * read from a context, per that spec's Open Questions #4: both the control
 * bar and this hook are siblings `CanvasFlow` itself instantiates, so
 * threading the same handlers as props/arguments is simpler than a new
 * context.
 */
export interface KeyboardShortcutHandlers {
  /** Calls the real React Flow instance's `zoomIn` (with a duration). */
  zoomIn: () => void
  /** Calls the real React Flow instance's `zoomOut` (with a duration). */
  zoomOut: () => void
  /** Calls Liveblocks' `useUndo()` handler. */
  undo: () => void
  /** Calls Liveblocks' `useRedo()` handler. */
  redo: () => void
}

/**
 * Attaches a single `keydown` listener to `window` for the same five actions
 * `CanvasControlBar` exposes as buttons:
 * - `+`/`=` → zoom in
 * - `-` → zoom out
 * - `Cmd/Ctrl+Z` → undo
 * - `Cmd/Ctrl+Shift+Z` → redo
 * - `Cmd/Ctrl+Y` → redo
 *
 * Ignores the keydown entirely when it originates from (or focus is inside)
 * an `<input>`, `<textarea>`, or another editable element (`isContentEditable`/
 * a `contenteditable` attribute) — this is what keeps the shortcuts from
 * hijacking spec 14's node-label `<textarea>` and spec 16's edge-label
 * `<input>` while a user is actively typing in either. Checks both
 * `event.target` and `document.activeElement`, per this spec's Analyst
 * Brief, Concrete deliverables.
 *
 * Calls `event.preventDefault()` on every recognized shortcut, so the app's
 * own handling wins over the browser's native behavior for the same keys
 * (e.g. `Cmd/Ctrl` plus `+`/`-` triggering native browser zoom, or
 * `Cmd/Ctrl+Y` triggering a native redo/history action in some browsers) —
 * see spec 17's Analyst Brief, Open Questions #5.
 */
export function useKeyboardShortcuts({ zoomIn, zoomOut, undo, redo }: KeyboardShortcutHandlers): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableElement(event.target) || isEditableElement(document.activeElement)) {
        return
      }

      const hasModifier = event.metaKey || event.ctrlKey

      if (hasModifier && (event.key === "z" || event.key === "Z")) {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if (hasModifier && (event.key === "y" || event.key === "Y")) {
        event.preventDefault()
        redo()
        return
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        zoomIn()
        return
      }

      if (event.key === "-") {
        event.preventDefault()
        zoomOut()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [zoomIn, zoomOut, undo, redo])
}

/**
 * `<input>`/`<textarea>`/`isContentEditable`/`contenteditable` check shared
 * by both the `event.target` and `document.activeElement` guards above.
 * Accepts `EventTarget | Element | null` since `event.target` and
 * `document.activeElement` have slightly different (but compatible-enough)
 * static types.
 */
function isEditableElement(node: EventTarget | Element | null): boolean {
  if (!(node instanceof Element)) return false

  const tagName = node.tagName
  if (tagName === "INPUT" || tagName === "TEXTAREA") return true

  return node.hasAttribute("contenteditable") || (node as HTMLElement).isContentEditable
}
