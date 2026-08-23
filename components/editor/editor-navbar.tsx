"use client"

import { UserButton } from "@clerk/nextjs"
import { Home, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface EditorNavbarProps {
  sidebarOpen: boolean
  onSidebarToggle: () => void
}

/**
 * Rendered by `EditorShell` on every `/editor/*` route (project canvas
 * included, since `EditorShell` wraps the whole route segment) — so the
 * `Home` link here is the one persistent way back to `/editor` (the
 * project-list "home", per `ui-context.md`) from inside a project's canvas,
 * where nothing else in the UI currently points back out. A plain
 * `next/link` `<Link>`, same navigation mechanism `project-sidebar.tsx`
 * already uses for its own project links — not `useRouter().push`, no new
 * navigation convention introduced.
 */
export function EditorNavbar({ sidebarOpen, onSidebarToggle }: EditorNavbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center border-b border-surface-border bg-surface px-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onSidebarToggle}>
          {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          <span className="sr-only">Toggle sidebar</span>
        </Button>
        <Link
          href="/editor"
          title="Home"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <Home />
          <span className="sr-only">Home</span>
        </Link>
      </div>
      <div className="flex-1" />
      <div className="flex items-center">
        <UserButton />
      </div>
    </header>
  )
}
