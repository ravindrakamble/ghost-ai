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

export function CreateProjectDialog() {
  const { dialogType, name, roomIdPreview, isLoading, error, setName, closeDialog, submitCreate } =
    useProjectDialogsContext()
  const isOpen = dialogType === "create"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submitCreate()
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-copy-primary">Create project</DialogTitle>
            <DialogDescription className="text-copy-secondary">
              Start a new architecture workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="create-project-name" className="text-copy-primary">
              Project name
            </Label>
            <Input
              id="create-project-name"
              className="text-copy-primary"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Checkout Service"
              autoFocus
            />
            <p className="text-xs text-copy-muted">
              {roomIdPreview ? `/editor/${roomIdPreview}` : "Enter a name to preview the room ID"}
            </p>
            {error && <p className="text-xs text-state-error">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isLoading}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
