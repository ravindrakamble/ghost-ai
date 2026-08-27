"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * `document.title` is one global resource, but `useCompletionNotification()`
 * is called independently by both `ai-architect-tab.tsx` and
 * `specs-tab.tsx`. A per-hook-instance `originalTitleRef` let a second
 * instance's flash snapshot the *first* instance's in-progress flash text as
 * if it were the real original title — corrupting whatever title got
 * restored on refocus when a design run and a spec run both completed while
 * hidden. Tracking the flash as module-level singleton state (one real
 * original title, one interval, one current owner) fixes that: starting a
 * new flash while one is already running resynchronizes to the same real
 * original title instead of re-snapshotting the currently-displayed text.
 */
let sharedOriginalTitle: string | null = null
let sharedFlashInterval: ReturnType<typeof setInterval> | null = null
let sharedFlashOwner: symbol | null = null

/**
 * Stops the active flash and restores the real title. With `ownerId`
 * supplied (an unmounting hook instance's own cleanup), this is a no-op
 * unless that instance currently owns the active flash — so one instance
 * unmounting can't kill a flash a different, still-mounted instance started
 * afterward. Called with no `ownerId` (tab regained focus) it always stops,
 * regardless of owner.
 */
function stopSharedFlash(ownerId?: symbol) {
  if (ownerId !== undefined && sharedFlashOwner !== ownerId) return

  if (sharedFlashInterval !== null) {
    clearInterval(sharedFlashInterval)
    sharedFlashInterval = null
  }
  if (sharedOriginalTitle !== null) {
    document.title = sharedOriginalTitle
    sharedOriginalTitle = null
  }
  sharedFlashOwner = null
}

/** Starts (or takes over) the shared title flash, owned by `ownerId`. */
function startSharedFlash(ownerId: symbol, flashText: string) {
  if (sharedFlashInterval !== null) {
    clearInterval(sharedFlashInterval)
    // A flash was already running — resync to the real original title
    // synchronously rather than re-snapshotting `document.title`, which
    // right now holds that other flash's alternating text, not the truth.
    document.title = sharedOriginalTitle as string
  } else {
    sharedOriginalTitle = document.title
  }

  sharedFlashOwner = ownerId
  const originalTitle = sharedOriginalTitle as string
  let showingFlash = false
  sharedFlashInterval = setInterval(() => {
    showingFlash = !showingFlash
    document.title = showingFlash ? flashText : originalTitle
  }, TITLE_FLASH_INTERVAL_MS)
}

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
 * `notifyCompletion` hands off to the shared, module-level flash state above
 * so a completion arriving mid-flash from *this same* hook instance
 * restarts cleanly (two concurrent flashes from one instance never stack),
 * and so a second hook instance's flash can't corrupt the first's recorded
 * original title. A `visibilitychange` listener, attached for this hook's
 * whole lifetime, restores the real title and stops any active flash the
 * moment the tab becomes visible again — regardless of which instance owns
 * it, since the tab being visible ends every flash unconditionally.
 */
export function useCompletionNotification(): UseCompletionNotificationResult {
  // Identifies this hook instance as a flash owner (see `stopSharedFlash`)
  // without depending on referential identity of a callback, which would
  // change across renders. `useRef` initializes once per mounted instance.
  const instanceIdRef = useRef<symbol | null>(null)
  if (instanceIdRef.current === null) {
    instanceIdRef.current = Symbol("useCompletionNotification instance")
  }

  useEffect(() => {
    const ownerId = instanceIdRef.current as symbol

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        stopSharedFlash()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      stopSharedFlash(ownerId)
    }
  }, [])

  const notifyCompletion = useCallback((message: string, options?: NotifyCompletionOptions) => {
    // A user who stays on the tab sees no behavior change from today —
    // acceptance criterion 2.
    if (document.visibilityState !== "hidden") return

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(NOTIFICATION_TITLE, { body: message })
      return
    }

    // Title-flash fallback: permission not yet granted (`"default"` or
    // `"denied"`), or the `Notification` API is unavailable in the current
    // browser.
    const flashText = options?.flashText ?? DEFAULT_FLASH_TEXT
    startSharedFlash(instanceIdRef.current as symbol, flashText)
  }, [])

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
