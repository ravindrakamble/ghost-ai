# Deploying to Vercel

## 1. Push to a git remote
Vercel deploys from GitHub/GitLab/Bitbucket. If there's no remote yet, create a repo and push `main`.

## 2. Import into Vercel
- vercel.com → **Add New → Project** → import the repo. Framework preset auto-detects Next.js — no `vercel.json` needed.
- Build command stays `next build` (default); `postinstall` already runs `prisma generate`, which Vercel runs automatically during install.

## 3. Set environment variables
In Project Settings → Environment Variables, add (values from local `.env`/`.env.local`, not committed):

- `DATABASE_URL` — must be reachable from Vercel's servers, so a local-only Postgres won't work. Needs a hosted Postgres (Neon, Prisma Postgres, Supabase, RDS, etc.).
- `LIVEBLOCKS_SECRET_KEY`
- `GEMINI_API_KEY`
- `TRIGGER_SECRET_KEY` — use the **prod** key (`tr_prod_...`) from Trigger.dev's dashboard, not the dev key, and run `npx trigger.dev@latest deploy` separately (see step 5) so prod tasks actually exist for it to call.
- `BLOB_READ_WRITE_TOKEN`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`

Also add the production domain to Clerk's dashboard (Allowed origins/redirect URLs) once the `*.vercel.app` URL or custom domain is known.

## 4. Run the Prisma migration against the prod DB
Vercel's build doesn't run `prisma migrate deploy` by default. Either:
- add `prisma migrate deploy` to the build command (e.g. `prisma migrate deploy && next build`), or
- run it manually once: `npx prisma migrate deploy` with `DATABASE_URL` pointed at the prod database.

## 5. Deploy Trigger.dev tasks separately
Vercel only hosts the Next.js app — it doesn't run `trigger/design-agent.ts`. Deploy tasks to Trigger.dev's own infra:
```
npx trigger.dev@latest deploy
```
Do this before/alongside the Vercel deploy so the prod `TRIGGER_SECRET_KEY` from step 3 has something to call.

## 6. Deploy
Push to `main` (or click Deploy) — Vercel builds and deploys automatically on every push once connected.
