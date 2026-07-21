We need the common interface elements that form the framework of every editor screen, specifically the top navigation bar and the left sidebar.. These will reused and extended in every chapter that follows.

### Editor NavBar

create `components/editor/editor-nabar.tsx`.

Requirements:
    - fixed-height top navbar
    - left, center and right sections
    - left section contains sidebar toggle button
    - use `PanelLeftOpen` / `PanelLeftClose` icons based on sidebar state
    - right section stays empty for now
    - dark background with subtle bottom border

### Project Sidebar

Create `components/editor/project-sidebar.tsx`

Requirements:
    - Sidebar should float above the editor canvas
    - opening it should not push the page content
    - slides in from left
    - accepts `isOpen` prop
    - header with `Projects` title + close button
    - shadcn `Tabs`:
        - My Projects
        - Shared
    - both tabs show empty placeholder state
    -- full-width `New Project` button at the bottom with `Plus` icon


### Dialog Pattern

Use the existing color tokens from `global.css`for dialog styling.

Support:
    - title
    - description
    - footer actions

Do not build actual dialog yet

### Check when done

    - new components compile without Typescript errors.
    - no lint errors
    - dialog pattern is ready for future use
