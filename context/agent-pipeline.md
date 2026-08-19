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
   - PASS → the spec is ready for you (the human) to review and mark done.
   - Changes requested → back to Product Analyst, capped at 2 rounds.
   - Unresolved after 2 rounds → escalates to you directly.
5. You review the Product Owner's PASS, spot-check if you want, and move on to the next spec.

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

Spec 05 (Prisma Postgres) is complete — see `context/progress-tracker.md`. It shipped a single-file `prisma/schema.prisma` rather than the multi-file `prisma/models/` split originally planned; later specs were corrected to reference the real path.

`package.json` still has no test runner configured (Playwright is present as a devDependency but nothing else) — spec 05 didn't need one. The Senior Developer agent is instructed to set up Vitest + React Testing Library on the first spec that actually needs tests and record that decision in `code-standards.md`. Expect that setup work to show up in that spec's Dev Notes as a prerequisite, not a deliverable of the spec itself.

Start the pipeline at **spec 06** (project APIs).
