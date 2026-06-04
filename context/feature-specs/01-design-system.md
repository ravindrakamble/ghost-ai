Read `AGENTS.md` before starting.

We're building a design system and UI primitive components.

Install and configure `shadcn/ui` as a dependency in `package.json`.

Add these shadcn components:
- Button
- Card
- Dialog
- Input
- Label
- Tabs
- Textarea
- ScrollArea

Do not modify the generated `components/ui/*` files after the installation.

Also install`lucide-react` as a dependency in `package.json`.

Create `lib/utils.ts` with a reuable `cn()` helper function for merging Tailwind classes.

Ensure all the components match the existing dark theme in `global.css`.

### Check when done

- All components import without errors.
- `cn()` helper works as expected.
- All components match the existing dark theme.
- No default light styling appears.