"use client"

import { UserButton } from "@clerk/nextjs"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EditorNavbarProps {
  sidebarOpen: boolean
  onSidebarToggle: () => void
}

export function EditorNavbar({ sidebarOpen, onSidebarToggle }: EditorNavbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-12 items-center border-b border-surface-border bg-surface px-3">
      <div className="flex items-center">
        <Button variant="ghost" size="icon-sm" onClick={onSidebarToggle}>
          {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>
      <div className="flex-1" />
      <div className="flex items-center">
        <UserButton />
      </div>
    </header>
  )
}
