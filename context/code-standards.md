# Code Standards

## General

- Keep modules small and single-purpose.
- Fix root causes — do not layer workarounds.
- Do not mix unrelated concerns in one component or route.
- Respect the system boundaries defined in `architecture-context.md`.

## TypeScript

- Strict mode is required throughout the project.
- Avoid `any`; use explicit interfaces or narrowly scoped types.
- Validate unknown external input at system boundaries before trusting it.
- Use `interface` for object contracts.

## Next.js

- Default to React Server Components.
- Add `"use client"` only when the component needs browser interactivity, hooks, or real-time state.
- Keep route handlers focused on a single responsibility.
- Long-running work belongs in background tasks, not in request handlers.

## Styling

- Use CSS custom property tokens defined in `globals.css` — no raw Tailwind color classes like `zinc-*` or hardcoded hex values.
- Reference tokens through their Tailwind utility names: `bg-base`, `text-copy-primary`, `border-surface-border`, `text-brand`, etc.
- Maintain the border radius scale: `rounded-xl` for small elements, `rounded-2xl` for cards, `rounded-3xl` for modals.

## API Routes

- Validate and parse request input before any logic runs.
- Enforce auth and project ownership checks before any mutation.
- Return consistent, predictable response shapes.
- Keep route handlers thin — push complexity into shared modules or background tasks.

## Data and Storage

- Project metadata and relationships belong in PostgreSQL via Prisma.
- Canvas snapshots and generated specs belong in Vercel Blob; Prisma stores only the blob URL reference.
- Do not store large generated content directly in the database.
- Task run records are first-class relational data — treat ownership and run IDs as verified before any token issuance.

## Testing

- Framework: Vitest, set up in spec 06 (first spec needing tests). Config at `vitest.config.mts` (`.mts` to avoid the ESM-in-CommonJS config warning; uses `import.meta.dirname`, not `__dirname`).
- Default test environment is `node` (most tests so far are API route handlers / server-side utilities). For component tests that need a DOM, add a `// @vitest-environment jsdom` docblock at the top of that test file — `jsdom`, `@testing-library/react`, `@testing-library/dom`, and `@testing-library/jest-dom` are installed for this.
- `@vitejs/plugin-react` and the testing-library packages were installed with `--legacy-peer-deps` due to a peer conflict between `@vitejs/plugin-react`'s Babel 8 optional peer and `shadcn`'s Babel 7 dependency chain. Re-check this if either package is upgraded.
- Playwright remains reserved for canvas/interaction-level checks, not general unit coverage.
- Test files live next to the code they cover, named `*.test.ts`/`*.test.tsx` (e.g. `app/api/projects/route.test.ts`).
- Mock Clerk's `auth()` (`@clerk/nextjs/server`) and the Prisma singleton (`@/lib/prisma`) with `vi.mock` + `vi.hoisted` in route handler tests — do not hit a real database or a real Clerk session in unit tests.
- Run with `npm test` (`vitest run`).

## File Organization

- `lib/` — shared infrastructure: Prisma client, auth helpers, utilities.
- `trigger/` — all durable background tasks and AI workflows.
- `components/` — UI composition only; no business logic.
- `app/api/` — route handlers for auth, triggering, and persistence.
- Name files after the responsibility they contain, not the technology.
