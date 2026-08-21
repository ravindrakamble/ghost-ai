import { defineConfig } from "@trigger.dev/sdk"

/**
 * Bootstraps Trigger.dev for this repo (spec 22's Analyst Brief, Open
 * Questions #1) — no `trigger.config.ts` or `trigger/` directory existed
 * before this spec, so there is nothing to "reuse."
 *
 * `project` is Trigger.dev's own project ref, found on the Project Settings
 * page in the dashboard. No real Trigger.dev project has been provisioned in
 * this environment yet (same category of gap already logged for
 * `LIVEBLOCKS_SECRET_KEY` and `BLOB_READ_WRITE_TOKEN`) — `TRIGGER_PROJECT_REF`
 * lets a human wire in the real ref via the environment without editing this
 * file, while the placeholder keeps this file syntactically complete (the
 * `project` field is required by `TriggerConfig`) until that happens. This
 * file is only read by the Trigger.dev CLI (`dev`/`deploy`), never imported
 * by the Next.js app itself, so a placeholder value here cannot break
 * `next build`.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "<trigger-project-ref-not-yet-provisioned>",
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
