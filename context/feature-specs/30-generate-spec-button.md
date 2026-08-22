Wire the "Generate Spec" button in the AI sidebar's Specs tab to actually trigger AI-powered spec generation from the current canvas and chat, closing the generate -> persist -> view -> download loop end to end from the UI.

### Implementation

1. Trigger generation

- on click, call `POST /api/ai/spec` with the current project's `roomId`, `chatHistory`, `nodes`, and `edges`
- follow the same two-call pattern already used for the design agent: `POST /api/ai/spec` for a `runId`, then `POST /api/ai/spec/token` for a run-scoped public token
- subscribe to the run with `useRealtimeRun` (`@trigger.dev/react-hooks`), same as the AI Architect tab already does

2. Button state

- disable the button and show a busy/spinner state while a run triggered from this button is in flight
- do not block or dim any other part of the Specs tab (the existing list, preview, download actions) while generating

3. On completion

- on success, refresh the spec list so the newly generated spec appears without a manual page reload
- on failure, show an inline error near the button; do not silently fail

4. Canvas/chat data access

- the Specs tab does not currently have access to the room's live `nodes`/`edges` or `chatHistory` — only `projectId` is threaded to it today
- thread whatever is needed following the existing callback-push-up pattern already established for `ai-status-feed` and `ai-chat` (`onAiStatusChange`, `onChatMessagesChange`), not a new global state mechanism

### UI Details

- use the existing sidebar layout and the existing "Generate Spec" button already present in the Specs tab, do not redesign
- reuse existing colors/tokens from `global.css` and this app's existing spinner/disabled-button conventions (see the AI Architect tab's Send button)
- keep the rest of the Specs tab (list, preview modal, downloads) untouched in shape

### Scope Limits

- do not add or change backend routes, the `generate-spec` Trigger.dev task, or the `ProjectSpec` model
- do not fetch Blob URLs directly in the client
- do not change the design-agent (`/api/ai/design*`) flow or its components
- do not redesign the sidebar or tabs
- do not add new global state beyond what's needed to thread canvas/chat data to this button, following the existing push-up pattern

### Notes

- reuse the existing two-call trigger/token/`useRealtimeRun` pattern from `components/editor/ai-architect-tab.tsx` (spec 26) rather than inventing a new one
- `POST /api/ai/spec`'s body shape (`roomId`, `chatHistory`, `nodes`, `edges`) and `POST /api/ai/spec/token`'s (`runId`) already exist and are unchanged by this spec (spec 27)
- the spec list refetch mechanism already exists on `useProjectSpecs` (spec 29) as `refetch`

### Check When Done

- clicking "Generate Spec" triggers a real spec-generation run for the current project
- the button shows a busy state and is disabled while that run is in flight
- on success, the spec list updates to include the newly generated spec without a manual refresh
- on failure, an inline error is shown near the button
- TypeScript and build pass
