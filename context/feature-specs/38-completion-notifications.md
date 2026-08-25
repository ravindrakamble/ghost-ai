Notify the user when a design-agent or spec-generation run finishes if they've navigated away from the tab, since `useRealtimeRun` only updates visible UI state while the component stays mounted and in view.

### Implementation

1. Notification hook

Create `hooks/use-completion-notification.ts`. Exposes a single `notifyCompletion(message: string)` function. When called while `document.visibilityState === "hidden"`:
- If the Notification API is available and permission is already `"granted"`, show a native browser notification with `message`.
- Otherwise (permission not yet granted, or the API is unavailable), fall back to flashing `document.title` (alternating between the original title and a short status like "✅ Ghost AI is done") until the tab regains focus (a `visibilitychange` listener restores the original title and stops the flash).

Request Notification permission lazily — only the first time a generation is actually submitted while the tab is visible (not on page load, and never while hidden, since a hidden tab can't prompt anyway). If permission is denied, never prompt again this session; just use the title-flash fallback.

2. Wire into design-agent completion

Modify `components/editor/ai-architect-tab.tsx`. In the existing run-settled effect (the one that already pushes a success/error message onto `ai-chat`), also call `notifyCompletion` with that same message text.

3. Wire into spec-generation completion

Modify `components/editor/specs-tab.tsx`. In the existing completion effect (spec 30), call `notifyCompletion` with a message reflecting success or failure, the same way.

### Scope Limits

- Do not add email or any server-side notification delivery — browser-only (Notification API + title flash), no new backend infrastructure.
- Do not add a persistent notification history/inbox.
- Do not request Notification permission on page load or from any place other than an actual generation submission.
- Do not change the existing on-tab status line/spinner behavior — this only adds a signal for when the tab is *not* being watched.

### Notes

- Both call sites already have the exact "this run just settled, success or failure" moment this hook needs — no new state duplication, just one extra call alongside the existing `ai-chat`/`sendAgentMessage` push.

### Check When Done

- Submitting a design or spec generation, then switching to another tab/app, produces a visible signal on return when the run completes — a native notification if permission was granted, a flashing tab title otherwise.
- A user who stays on the tab sees no behavior change from today.
- Notification permission is never requested outside of an actual generation submission.
- `npm run build` passes.
