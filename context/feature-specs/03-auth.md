Clerk is already installed and connected. Wire it into Next.js app: provider, auth pages, redirects, roue protection, and user menu.

## Design

Use Cler's `dark` theme from `@clerk/ui/themes` as the base.

Override clerk appearance variables using the app's existing CSS varaibles. Do not hardcode colors.

### Sign-in and sign-up pages:
    - large screens: simple two-panel layout
    - left: compact logo, tagline, short test-oly feature list
    - right:centered Clerk form
    - small screens: form only
    - no gradients
    - no oversized hero sections
    - no feature cards
    - no scroll-heavy layouts

    Keep the layout minimal and professional.

## Implementation
 Wrap the root layout with `ClerkProvider` using Clerk's `dark` theme.
 Create sign-in and sign-up pages using Clerk components.
 Define public routes using the existing aign-in and sign-up env-vars. Protect everything else by default.

 Update `/`:
    - authenticated users redirect to `/editor`
    - unauthenticated users redirect to `/sign-in`

Add Clerk's built-in `UserButton` to the editor navbar right section for profile settings and logout.

Keep Clerk's default user menu and profile flows intact. Do not rebuild or heavily customize Clerk internals.

Use existing Clerk env vars. 

## Check when done
    - All routes are protected except public paths.
    - auth pages use css variables with no hardcoded colors.