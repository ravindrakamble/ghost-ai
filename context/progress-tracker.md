# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase
- Phase 4: Project Dialogs

## Current Goal
- Move to the next feature spec.

## Completed

- Feature spec 04: Project Dialogs
  - `/editor` home now renders an empty-state prompt (heading, description, `New Project` button) instead of the placeholder canvas text; content is not wrapped in a card.
  - Added `types/project.ts` (`Project`, `ProjectRole`), `lib/mock-projects.ts` (mock owner/collaborator projects), and `lib/slug.ts` (`slugify`) for the live slug preview.
  - Added `components/editor/use-project-dialogs.ts` — dedicated hook owning dialog type/active project, form `name`/derived `slug`, and `isLoading`, plus mock create/rename/delete mutators (in-memory only, no API calls).
  - Added `components/editor/project-dialogs-provider.tsx` — React context wrapping `EditorShell` children so the sidebar and the editor home page share one hook instance; renders the three dialogs.
  - Added `components/editor/dialogs/{create,rename,delete}-project-dialog.tsx`. Create shows a live slug preview under the name input; Rename prefills the name, auto-focuses, shows the current name in the description, and submits on Enter via a `<form>`; Delete is a destructive-only confirmation with no input and a `destructive`-variant confirm button.
  - `components/editor/project-sidebar.tsx` now lists real mock projects per tab — owned projects show hover-revealed Rename/Delete icon buttons, shared/collaborator projects show none. Added a mobile-only (`md:hidden`) backdrop scrim behind the sidebar that closes it on tap/click.
  - `components/editor/editor-shell.tsx` wraps its tree in `ProjectDialogsProvider`.
  - `npx tsc --noEmit`, `npx eslint`, and `npx next build` all pass with no errors.
  - Not visually verified in-browser: `/editor` is behind Clerk auth (`proxy.ts` middleware) and no signed-in session/credentials were available in this session — verified via type-check, lint, and production build only.

- Feature spec 03: Auth
  - `ClerkProvider` switched to `dark` theme (`@clerk/ui/themes`); appearance variables override all colors via CSS custom properties — no hardcoded values.
  - `/` root page is a server component: redirects authenticated users to `/editor`, unauthenticated to `/sign-in`.
  - Sign-in and sign-up pages redesigned with two-panel layout: left panel (logo, tagline, feature list) hidden on small screens; right panel centers the Clerk form. No gradients, no hero sections.
  - `EditorNavbar` simplified to `UserButton` only — removed `SignInButton`/`SignUpButton` and `Show` conditionals (editor is always protected).
  - All routes protected via `clerkMiddleware` in `proxy.ts`; `/sign-in` and `/sign-up` remain public.
  - TypeScript passes with no errors.

- Clerk Authentication
  - Installed Clerk CLI, linked to GhostAI app (`app_3EhS2dz9dgewfzyFSunyWf0MVMe`).
  - `@clerk/nextjs` installed; `ClerkProvider` wrapping `<body>` in `app/layout.tsx`.
  - `proxy.ts` middleware: all routes protected except `/sign-in` and `/sign-up`; `/__clerk/:path*` added to matcher.
  - Sign-in and sign-up pages scaffolded at `app/sign-in/[[...sign-in]]/page.tsx` and `app/sign-up/[[...sign-up]]/page.tsx`.
  - `@clerk/ui` installed with shadcn theme applied to `ClerkProvider` and imported in `globals.css`.
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` populated in `.env.local` via `clerk env pull`.
  - Auth controls (`SignInButton`, `SignUpButton`, `UserButton`, `Show`) added to `EditorNavbar` right section.

- Feature spec 02: Editor Shell
  - Created `components/editor/editor-navbar.tsx` — fixed-height top navbar, left sidebar toggle using `PanelLeftOpen`/`PanelLeftClose`, dark background with bottom border.
  - Created `components/editor/project-sidebar.tsx` — floating overlay sidebar (no push), slides in from left, Projects title + close button, shadcn Tabs (My Projects / Shared) with empty states, full-width New Project button.
  - Dialog pattern confirmed ready: existing `components/ui/dialog.tsx` already supports title, description, and footer actions via project color tokens.
  - TypeScript passes with no errors.

- Feature spec 01: Design System
  - Installed `shadcn/ui` (v4 base-nova preset, `@base-ui/react` primitives) and `lucide-react`.
  - Added `clsx`, `tailwind-merge`, `class-variance-authority` as dependencies.
  - Generated `lib/utils.ts` with `cn()` helper.
  - Generated `components/ui/` — Button, Card, Dialog, Input, Label, Tabs, Textarea, ScrollArea.
  - Updated `app/globals.css` with all dark-theme CSS custom properties (`--bg-base`, `--accent-primary`, etc.) and shadcn semantic tokens wired to dark values. Added `@theme inline` mappings for project utility names (`bg-base`, `text-copy-primary`, `border-surface-border`, `text-brand`, `bg-accent-dim`, etc.).
  - Added `dark` class to `<html>` in `app/layout.tsx` to activate `dark:` variant classes.
  - Updated `app/page.tsx` to use dark theme token classes.
  - TypeScript and `next build` both pass with no errors.

## In Progress

- None.

## Next Up
- Feature spec 05 (TBD)

## Open Questions

- None yet.

## Architecture Decisions

- Using shadcn/ui v4 with `@base-ui/react` primitives (not Radix UI) — this is the default for the "base-nova" preset in shadcn v4.
- Tailwind v4 CSS-first configuration — no `tailwind.config.js`. All tokens in `globals.css` via `@theme inline`.
- Dark-only: `:root` and `.dark` both carry identical dark values. `<html>` always has `class="dark"`.

## Session Notes

- Next.js 16.2.6, React 19.2.4, Tailwind v4, shadcn v4.
- `components/ui/` files are generated — do not modify them.
- Theme tokens live in `globals.css`; components consume via Tailwind utility names.
