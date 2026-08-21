import { defineConfig } from "@trigger.dev/sdk"

/**
 * Bootstraps Trigger.dev for this repo (spec 22's Analyst Brief, Open
 * Questions #1) — no `trigger.config.ts` or `trigger/` directory existed
 * before that spec, so there was nothing to "reuse."
 *
 * `project` is Trigger.dev's own project ref, from the Project Settings page
 * in the dashboard — a real one is now provisioned (`proj_oplmzjedrflomzxqfmqm`),
 * closing the human-provisioning gap this file used to defer via
 * `TRIGGER_PROJECT_REF`. It's committed directly (not a secret — Trigger.dev's
 * own docs/scaffolded config commit it the same way) rather than routed
 * through an env var. This file is only read by the Trigger.dev CLI
 * (`dev`/`deploy`), never imported by the Next.js app itself.
 *
 * `dirs` stays `["./trigger"]`, not the `["./src/trigger"]` a from-scratch
 * `trigger.dev init` would scaffold — this repo has no `src/` directory at
 * all (Next.js App Router lives at the repo root: `app/`, `components/`,
 * `lib/`, etc.), and `trigger/design-agent.ts` (spec 22/23) already exists,
 * is imported from several places as `@/trigger/design-agent`, and is fully
 * tested. Moving it would be pure churn with no functional benefit.
 */
export default defineConfig({
  project: "proj_oplmzjedrflomzxqfmqm",
  dirs: ["./trigger"],
  // Required by the installed SDK's `TriggerConfig` type (unlike the SDK's
  // own bundled docs example, which shows it as optional). 60s is generous
  // for this spec's log-and-echo task; later AI-generation tasks (spec 23+)
  // can override per-task via their own `task({ maxDuration })`.
  maxDuration: 60,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
})
