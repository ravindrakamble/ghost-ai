"use client"

import { useProjectDialogsContext } from "@/components/editor/project-dialogs-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function DeleteProjectDialog() {
  const { dialogType, activeProject, isLoading, closeDialog, submitDelete } =
    useProjectDialogsContext()
  const isOpen = dialogType === "delete"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-copy-primary">Delete project</DialogTitle>
          <DialogDescription className="text-copy-secondary">
            This will permanently delete &ldquo;{activeProject?.name}&rdquo;. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={isLoading} onClick={submitDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
