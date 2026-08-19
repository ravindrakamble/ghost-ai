# Agent Pipeline

How the four subagents in `.claude/agents/` (`product-analyst`, `senior-developer`, `qa`, `product-owner`) work together to build the remaining feature specs one at a time.

## The loop

For each spec in `context/feature-specs/`, in order:

1. **Product Analyst** reads the spec + all context files and writes an Analyst Brief.
2. **Senior Developer** implements exactly that brief, with error handling and unit tests.
3. **QA** verifies the implementation against the brief and this repo's standards.
   - If QA finds bugs → back to Senior Developer, then QA re-checks.
   - If QA finds a spec gap → back to Product Analyst for a brief revision, then Senior Developer picks it up, then QA re-checks.
4. **Product Owner** reviews a QA-passed implementation against `project-overview.md`'s success criteria and scope.
   - PASS → pushes the spec's branch and opens a PR against `main` via `gh pr create`, then the spec is ready for you (the human) to review and merge.
   - Changes requested → back to Product Analyst, capped at 2 rounds. No PR opened.
   - Unresolved after 2 rounds → escalates to you directly. No PR opened.
5. You review the PR, merge (or send it back) yourself. The Product Owner never merges.

Only one spec is in flight at a time. Do not start the next spec's Analyst pass until the current spec has a human-reviewed PASS — this matches `ai-workflow-rules.md`'s "one feature unit at a time" rule and avoids two passes touching the same files concurrently (several specs, especially the canvas ones, share files like `types/canvas.ts`).

## Shared state: `context/spec-status/`

Each spec gets one status file, `context/spec-status/<NN>-<slug>.md`, matching the numbering in `context/feature-specs/`. This is how the four roles hand off to each other without shared memory — each subagent invocation starts fresh and reads this file to pick up where the last one left off.

Sections accumulate in order as the spec moves through the pipeline:

```
## Analyst Brief
...

## Dev Notes
...

## QA Report
...

## Product Owner Review (round 1)
...
```

If a spec bounces back (QA → Dev, QA → Analyst, or PO → Analyst), the returning role appends a new dated section rather than overwriting — keep the full history of a spec's pass through the pipeline visible in one file.

## Version control

Each spec lives on its own branch, `spec/<NN>-<slug>`, created by the Senior Developer at the start of implementation and never touched by Analyst or QA (they don't have Bash/git access). Dev commits its own work there, including any QA-driven bugfix rounds. Nothing is pushed until Product Owner reaches a PASS verdict — at that point PO pushes the branch and opens the PR itself. This means a spec produces at most one open PR, only once it's actually ready for you to look at, never mid-review.

## Suggested invocation (Claude Code)

```
# Spec 06
claude "Use product-analyst on context/feature-specs/06-project-apis.md"
claude "Use senior-developer on context/spec-status/06-project-apis.md"
claude "Use qa on context/spec-status/06-project-apis.md"
claude "Use product-owner on context/spec-status/06-project-apis.md"
```

Or drive it as one instruction per spec ("run the full pipeline on spec 05") and let the orchestrating session invoke each subagent in sequence — either works; the subagent definitions don't assume which.

## Status

This file documents the process, not the current state — it doesn't change spec to spec, so it isn't the place to look for "what's done" or "what's next." That lives in `context/progress-tracker.md`, which the Product Owner updates on every PASS (see "Who updates `progress-tracker.md`" below). Check there, not here, for current phase and next spec.

This file only gets edited when the *process itself* changes — a new role, a different branching model, a change to how status files hand off. If you find yourself updating this file's status just to reflect a spec finishing, that's a sign something in the pipeline isn't updating `progress-tracker.md` correctly — fix that instead of patching this file.

## Who updates `progress-tracker.md`

- **Senior Developer**, mid-pass: notes the spec under "In Progress." Never writes it under "Completed" — Dev doesn't run again after QA/PO, so it can't know the final verdict.
- **Product Owner**, only on PASS: moves the spec from "In Progress" to "Completed" (with a one-line summary and the PR URL), and advances "Current Phase" / "Next Up" to the following spec. On CHANGES REQUESTED or ESCALATE, PO leaves it under "In Progress" — it isn't done yet.
