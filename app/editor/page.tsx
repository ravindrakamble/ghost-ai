"use client"

import { Plus } from "lucide-react"
import { useProjectDialogsContext } from "@/components/editor/project-dialogs-provider"
import { Button } from "@/components/ui/button"

export default function EditorPage() {
  const { openCreateDialog } = useProjectDialogsContext()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-base px-4 text-center">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold text-copy-primary">
          Create a project or open an existing one
        </h1>
        <p className="text-sm text-copy-muted">
          Start a new architecture workspace, or choose a project from the sidebar.
        </p>
      </div>
      <Button className="gap-2" onClick={openCreateDialog}>
        <Plus />
        New Project
      </Button>
    </div>
  )
}
