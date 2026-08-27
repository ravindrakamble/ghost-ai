"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * Branded, stable title for every native `Notification` this hook shows —
 * `message` supplies the dynamic `body`, per the Analyst Brief's Open
 * Questions #4, the same "stable label + dynamic content" pairing
 * `ai-chat`'s own bubbles already use (a fixed `sender` alongside dynamic
 * `content`).
 */
const NOTIFICATION_TITLE = "Ghost AI"

/**
 * Alternation interval (ms) for the `document.title` fallback flash — a
 * fixed, Dev-level constant in the same category as this codebase's other
 * unpinned-by-spec timing constants (`ZOOM_TRANSITION_DURATION_MS`,
 * `CANVAS_AUTOSAVE_DEBOUNCE_MS`, `SEARCH_HIGHLIGHT_DURATION_MS`), per the
 * Analyst Brief's Open Questions #3 — no exact number is pinned by the raw
 * spec text.
 */
const TITLE_FLASH_INTERVAL_MS = 1000

/**
 * Fallback title-flash status text used when a call site doesn't supply its
 * own via `NotifyCompletionOptions.flashText` — the raw spec's own
 * illustrative example.
 */
const DEFAULT_FLASH_TEXT = "✅ Ghost AI is done"

export interface NotifyCompletionOptions {
  /**
   * Overrides the short status text alternated with the real page title
   * during the fallback flash (used only when a native `Notification` isn't
   * shown) — lets a call site's own success/failure outcome read distinctly
   * given a flashing tab title's very limited space, per the Analyst
   * Brief's Open Questions #3. Defaults to `DEFAULT_FLASH_TEXT` when
   * omitted.
   */
  flashText?: string
}

export interface UseCompletionNotificationResult {
  /**
   * The spec's own named entry point (raw spec's "exposes a single
   * `notifyCompletion(message: string)` function"). A no-op while the tab
   * is visible (`document.visibilityState !== "hidden"`) — this is what
   * keeps "a user who stays on the tab sees no behavior change from today"
   * true. Called only from the two run-completion effects this feature
   * wires into (`ai-architect-tab.tsx`, `specs-tab.tsx`).
   */
  notifyCompletion: (message: string, options?: NotifyCompletionOptions) => void
  /**
   * Requests Notification permission, but only at the genuine "a
   * generation was just submitted" moment (`submitDesignRequest`,
   * `handleGenerateSpec`) — see this hook's own docblock for why this can't
   * be folded into `notifyCompletion` itself (Analyst Brief, Open
   * Questions #1). Never re-prompts once permission has been explicitly
   * granted or denied this session, since it only ever calls
   * `Notification.requestPermission()` while `Notification.permission ===
   * "default"`.
   */
  requestPermissionOnSubmit: () => void
}

/**
 * Completion-notification mechanism (spec 38) — a visible signal when a
 * design-agent or spec-generation run finishes while the user has navigated
 * away from the tab, since `useRealtimeRun`'s state only updates visibly
 * while the sidebar stays mounted and in view. Browser-only, client-local
 * to the submitting user's own tab — no email/server delivery, no
 * persistent notification history (this spec's own Scope Limits).
 *
 * Returns two functions rather than the raw spec's literal "single
 * function" wording, per the Analyst Brief's Open Questions #1: by the time
 * `notifyCompletion` ever actually runs (at run completion), the tab may
 * already be hidden — exactly the scenario this feature exists for — so
 * requesting permission there would frequently be requesting from a hidden
 * tab, which the raw spec explicitly forbids. `requestPermissionOnSubmit`
 * is the genuine "a generation was just submitted" moment instead,
 * guaranteed synchronous and tab-visible at both of its call sites (a click
 * handler cannot fire on a hidden tab).
 *
 * `notifyCompletion` clears any title-flash already in progress before
 * starting a new one (mirrors `canvas.tsx`'s own "clear the previous
 * timeout before scheduling a new one" convention from spec 36's search-
 * highlight clearing) — two concurrent flashes never stack. A single
 * `visibilitychange` listener, attached for this hook's whole lifetime,
 * restores the real title and stops any active flash the moment the tab
 * becomes visible again.
 */
export function useCompletionNotification(): UseCompletionNotificationResult {
  const originalTitleRef = useRef<string | null>(null)
  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** Stops any in-progress title flash and restores the real title. A safe
   * no-op when no flash is currently running. */
  const stopFlashing = useCallback(() => {
    if (flashIntervalRef.current !== null) {
      clearInterval(flashIntervalRef.current)
      flashIntervalRef.current = null
    }
    if (originalTitleRef.current !== null) {
      document.title = originalTitleRef.current
      originalTitleRef.current = null
    }
  }, [])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        stopFlashing()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      stopFlashing()
    }
  }, [stopFlashing])

  const notifyCompletion = useCallback(
    (message: string, options?: NotifyCompletionOptions) => {
      // A user who stays on the tab sees no behavior change from today —
      // acceptance criterion 2.
      if (document.visibilityState !== "hidden") return

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(NOTIFICATION_TITLE, { body: message })
        return
      }

      // Title-flash fallback: permission not yet granted (`"default"` or
      // `"denied"`), or the `Notification` API is unavailable in the
      // current browser.
      stopFlashing()

      const flashText = options?.flashText ?? DEFAULT_FLASH_TEXT
      const originalTitle = document.title
      originalTitleRef.current = originalTitle
      let showingFlash = false

      flashIntervalRef.current = setInterval(() => {
        showingFlash = !showingFlash
        document.title = showingFlash ? flashText : originalTitle
      }, TITLE_FLASH_INTERVAL_MS)
    },
    [stopFlashing],
  )

  const requestPermissionOnSubmit = useCallback(() => {
    if (typeof Notification === "undefined") return
    // Never prompts from a hidden tab — a hidden tab can't prompt anyway,
    // and this is the raw spec's own explicit rule.
    if (document.visibilityState !== "visible") return
    // Browsers never re-show a prompt once a user has explicitly granted or
    // denied it — gating on `"default"` is what makes "never prompt again
    // this session" true for free, off the browser's own persisted state.
    if (Notification.permission !== "default") return

    void Notification.requestPermission()
  }, [])

  return { notifyCompletion, requestPermissionOnSubmit }
}
