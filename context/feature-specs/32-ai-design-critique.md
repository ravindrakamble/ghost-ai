Make the design agent explain what it changed and why, and add a one-click way to ask it to critique the existing diagram instead of only generating from a fresh prompt.

### Implementation

1. Model output gains a summary

Modify `lib/design-agent-ai.ts`.

Extend the JSON Schema/`RawDesignAgentActionsResponse` so the model returns a `summary` field alongside `actions` — a short (1-2 sentence) explanation of what changed and why, grounded in the same `currentGraph` context already passed into the prompt. Add `summary` as a required top-level field next to `actions` in `DESIGN_AGENT_ACTIONS_JSON_SCHEMA`, validate it in `isRawDesignAgentActionsResponse`, and change `interpretDesignPrompt`'s return type from `DesignAgentAction[]` to `{ actions: DesignAgentAction[]; summary: string }`.

Update `buildPrompt` to ask explicitly for this summary, and — when the user's request reads as a review/critique rather than a build request — to actually critique the diagram (call out single points of failure, missing caching/queueing, unclear boundaries, etc.) before deciding what actions to take.

2. Thread the summary through the task

Modify `trigger/design-agent.ts`.

`runDesignAgent` currently discards everything from `interpretDesignPrompt` except the actions array. Keep the real `summary` string, add it to `DesignAgentResult` (`{ roomId, actionCount, summary }`), and use it as the "complete" status broadcast text instead of the current generic count-based string.

3. Show the real summary in chat

Modify `components/editor/ai-architect-tab.tsx`.

Its completion effect currently pushes a hardcoded `DESIGN_AGENT_SUCCESS_MESSAGE` regardless of what happened. Read `realtimeRun.output?.summary` (typed via `DesignAgentResult`) and push that instead when it's a non-empty string; fall back to the existing generic message only if it's missing.

4. Add a critique entry point

Modify `components/editor/ai-architect-tab.tsx`.

Add a "Critique this design" quick action alongside the existing `STARTER_PROMPTS` chips, with fixed prompt text asking the agent to review the current diagram for architectural issues and apply improvements. It submits through the exact same `submitDesignRequest` flow already used for typed prompts — no new API route.

### Scope Limits

- Do not add a "critique only, don't apply changes" mode — this reuses the existing action-application pipeline as-is.
- Do not change the 7 action kinds in `DESIGN_AGENT_ACTION_KINDS`.
- Do not touch `trigger/generate-spec.ts`, `lib/generate-spec-ai.ts`, or the Specs tab.
- Do not add a new AI provider abstraction — reuse the existing Gemini `generateObject` call.

### Notes

- `DesignAgentResult` is Trigger.dev run output, readable client-side via `useRealtimeRun`'s `run.output` field (already imported in `ai-architect-tab.tsx`) — no new fetch or route needed to get the summary to the client.
- Keep the "complete" broadcast text (`ai-status-feed`) and the chat completion message using the same `summary`, rather than two independently-worded descriptions of the same run.

### Check When Done

- A design-agent run's `ai-chat` completion message reflects the model's real summary of what it changed, not a generic canned string.
- A "Critique this design" action exists in the sidebar and triggers a real run through the existing `/api/ai/design` pipeline.
- TypeScript and build pass.
