"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StarterTemplatePreview } from "@/components/editor/starter-template-preview"
import { CANVAS_TEMPLATES, type CanvasTemplate } from "@/components/editor/starter-templates"

interface StarterTemplatesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (template: CanvasTemplate) => void
}

/**
 * Dialog listing the fixed `CANVAS_TEMPLATES` library as a scrollable grid
 * of cards (name, description, `StarterTemplatePreview`, Import button) —
 * spec 18. Built on the same `components/ui/dialog.tsx` primitives
 * `share-dialog.tsx` already uses, not a new modal mechanism. Presentational
 * only: `CanvasFlow` (`components/editor/canvas.tsx`) owns the actual
 * clear-then-add import mechanism and passes it in as `onImport`.
 */
export function StarterTemplatesModal({ open, onOpenChange, onImport }: StarterTemplatesModalProps) {
  function handleImport(template: CanvasTemplate) {
    onImport(template)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-copy-primary">Starter templates</DialogTitle>
          <DialogDescription className="text-copy-secondary">
            Replace the current canvas with a ready-made system design. This clears any existing nodes and edges.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] grid-cols-1 gap-6 overflow-y-auto py-1 sm:grid-cols-2 lg:grid-cols-3">
          {CANVAS_TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-elevated p-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-copy-primary">{template.name}</h3>
                <p className="text-xs text-copy-muted">{template.description}</p>
              </div>
              <div className="flex items-center justify-center overflow-hidden rounded-xl border border-surface-border bg-base">
                <StarterTemplatePreview template={template} />
              </div>
              <Button type="button" className="w-full" onClick={() => handleImport(template)}>
                Import
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
