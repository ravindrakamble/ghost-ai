"use client"

import { Plus } from "lucide-react"
import { useProjectDialogsContext } from "@/components/editor/project-dialogs-provider"
import { Button } from "@/components/ui/button"

/**
 * Client leaf rendered by the (server) editor home page. Opens the create
 * project dialog via the shared dialogs context — isolated here so `page.tsx`
 * itself can stay a server component.
 */
export function EditorHomeEmptyState() {
  const { openCreateDialog } = useProjectDialogsContext()

  return (
    <Button className="gap-2" onClick={openCreateDialog}>
      <Plus />
      New Project
    </Button>
  )
}
