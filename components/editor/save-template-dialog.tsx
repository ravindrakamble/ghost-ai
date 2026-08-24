"use client"

import { useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"

interface SaveTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Owned by `CanvasFlow` — POSTs `{ name, description, nodes, edges }` using its own live `nodes`/`edges`. Returns whether the save succeeded, so this presentational dialog knows whether to close itself. */
  onSave: (name: string, description: string) => Promise<boolean>
  isSaving: boolean
  error: string | null
}

/**
 * "Save as template" dialog (spec 33) — name + optional description, saved
 * as a new `CustomTemplate` via the caller's `onSave`. Built on the same
 * `components/ui/dialog.tsx` primitives `share-dialog.tsx`/
 * `starter-templates-modal.tsx` already use, not a new modal mechanism.
 *
 * Presentational only, mirroring `ShareDialog`'s "fully presentational,
 * mutation owned by parent" convention: `CanvasFlow` owns the actual
 * `POST /api/templates` call, its in-flight (`isSaving`) and error state,
 * and the live `nodes`/`edges` this save needs — this component only
 * collects `name`/`description` and reports them back. Rendered as a
 * sibling of `<StarterTemplatesModal>` inside `CanvasFlow`, per spec 33's
 * Analyst Brief, Open Questions #3 (`CanvasControlBar` stays a thin,
 * props-only trigger).
 *
 * Validation (spec 33's Analyst Brief, Open Questions #5): `name` required,
 * trimmed, non-empty — the Save button is disabled while the trimmed name is
 * empty or a save is in flight, mirroring `ShareDialog`'s exact
 * `disabled={!email.trim() || isInviting}` pattern for its own required-field
 * submit button. `description` is optional, trimmed, no minimum or maximum
 * length enforced.
 */
export function SaveTemplateDialog({ open, onOpenChange, onSave, isSaving, error }: SaveTemplateDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  // Every close path (Escape, backdrop click) routes through this callback,
  // so resetting the dialog's own local fields here — rather than in a
  // `useEffect` watching `open` — covers all of them without an
  // effect-driven setState, mirroring `ShareDialog`'s own
  // `handleOpenChange`.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setName("")
      setDescription("")
    }
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || isSaving) return

    const success = await onSave(trimmedName, description.trim())
    if (success) {
      handleOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-copy-primary">Save as template</DialogTitle>
          <DialogDescription className="text-copy-secondary">
            Save the current canvas as a private, reusable template you can import into any project later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              placeholder="e.g. Microservices baseline"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="text-copy-primary"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-description">Description (optional)</Label>
            <Textarea
              id="template-description"
              placeholder="What is this template for?"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="text-copy-primary"
              rows={3}
            />
          </div>

          {error && <p className="text-xs text-state-error">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
