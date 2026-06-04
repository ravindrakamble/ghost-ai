# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase
- Phase 1: Design System

## Current Goal
- Move to the next feature spec.

## Completed

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
- Feature spec 02 (TBD)

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
