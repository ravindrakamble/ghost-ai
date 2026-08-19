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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function RenameProjectDialog() {
  const { dialogType, activeProject, name, isLoading, error, setName, closeDialog, submitRename } =
    useProjectDialogsContext()
  const isOpen = dialogType === "rename"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submitRename()
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-copy-primary">Rename project</DialogTitle>
            <DialogDescription className="text-copy-secondary">
              Currently named &ldquo;{activeProject?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="rename-project-name" className="text-copy-primary">
              Project name
            </Label>
            <Input
              id="rename-project-name"
              className="text-copy-primary"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-state-error">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isLoading}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
