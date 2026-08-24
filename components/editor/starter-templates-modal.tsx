"use client"

import { useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
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
import { useCustomTemplates } from "@/hooks/use-custom-templates"

interface StarterTemplatesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (template: CanvasTemplate) => void
}

/** Shape `GET /api/templates/[templateId]` returns — matches `CanvasTemplate`'s own field set exactly, so it can be handed straight to `onImport` with no reshaping (spec 33's Analyst Brief, Concrete deliverables). */
interface SavedTemplateDetail {
  id: string
  name: string
  description: string | null
  nodes: CanvasTemplate["nodes"]
  edges: CanvasTemplate["edges"]
}

/**
 * Dialog listing the fixed `CANVAS_TEMPLATES` library as a scrollable grid
 * of cards (name, description, `StarterTemplatePreview`, Import button) —
 * spec 18. Built on the same `components/ui/dialog.tsx` primitives
 * `share-dialog.tsx` already uses, not a new modal mechanism.
 *
 * Spec 33 (Custom Templates) adds a second, visually distinct "My Templates"
 * section listing the current user's own saved templates, fetched via
 * `useCustomTemplates()` called directly inside this component — mirroring
 * `SpecsTab`'s existing precedent of calling `useProjectSpecs` directly in a
 * leaf component, per spec 33's Analyst Brief, Concrete deliverables. Each
 * saved-template card gets a delete action (the `removingId`-tracked
 * busy-state convention `ShareDialog`'s collaborator removal already uses)
 * in addition to an Import button. Clicking Import on a saved template
 * fetches `GET /api/templates/[templateId]` then calls the same `onImport`
 * prop with the response reshaped into a `CanvasTemplate` — no new import
 * mechanism, the same clear-then-add flow `CanvasFlow#handleImportTemplate`
 * already uses for built-in templates.
 *
 * `CanvasFlow` (`components/editor/canvas.tsx`) still owns the actual
 * clear-then-add import mechanism and passes it in as `onImport` — this
 * component is presentational for both the built-in and saved-template
 * flows.
 */
export function StarterTemplatesModal({ open, onOpenChange, onImport }: StarterTemplatesModalProps) {
  const { templates, isLoading, error, removingId, remove } = useCustomTemplates()
  const [importingId, setImportingId] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  function handleImport(template: CanvasTemplate) {
    onImport(template)
    onOpenChange(false)
  }

  async function handleImportSaved(templateId: string) {
    setImportError(null)
    setImportingId(templateId)
    try {
      const response = await fetch(`/api/templates/${templateId}`)
      const body: Partial<SavedTemplateDetail> & { error?: string } = await response
        .json()
        .catch(() => ({}))

      if (!response.ok || !body.id || !body.nodes || !body.edges) {
        setImportError(body.error ?? "Failed to load the template.")
        return
      }

      handleImport({
        id: body.id,
        name: body.name ?? "Untitled template",
        description: body.description ?? "",
        nodes: body.nodes,
        edges: body.edges,
      })
    } catch {
      setImportError("Failed to load the template. Please check your connection and try again.")
    } finally {
      setImportingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-5xl rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-copy-primary">Starter templates</DialogTitle>
          <DialogDescription className="text-copy-secondary">
            Replace the current canvas with a ready-made system design. This clears any existing nodes and edges.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-1">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CANVAS_TEMPLATES.map((template) => (
              <div
                key={template.id}
                className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-elevated p-4"
              >
                <div className="min-h-14">
                  <h3 className="line-clamp-1 text-sm font-semibold text-copy-primary">{template.name}</h3>
                  <p className="line-clamp-2 text-xs text-copy-muted">{template.description}</p>
                </div>
                <div className="flex items-center justify-center overflow-hidden rounded-xl border border-surface-border bg-base">
                  <StarterTemplatePreview template={template} />
                </div>
                <Button type="button" className="mt-auto w-full" onClick={() => handleImport(template)}>
                  Import
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-surface-border pt-6">
            <div>
              <h3 className="text-sm font-semibold text-copy-primary">My templates</h3>
              <p className="text-xs text-copy-muted">
                Templates you&apos;ve saved from your own canvases. Visible only to you.
              </p>
            </div>

            {importError && <p className="text-xs text-state-error">{importError}</p>}
            {error && <p className="text-xs text-state-error">{error}</p>}

            {isLoading ? (
              <p className="py-4 text-center text-sm text-copy-muted">Loading your saved templates…</p>
            ) : templates.length === 0 ? (
              <p className="py-4 text-center text-sm text-copy-muted">
                No saved templates yet. Use &ldquo;Save as template&rdquo; on the canvas control bar to save one.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-elevated p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-h-14 min-w-0 flex-1">
                        <h3 className="line-clamp-1 text-sm font-semibold text-copy-primary">
                          {template.name}
                        </h3>
                        <p className="line-clamp-2 text-xs text-copy-muted">
                          {template.description || "No description."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={removingId === template.id}
                        onClick={() => void remove(template.id)}
                        aria-label={`Delete ${template.name}`}
                      >
                        {removingId === template.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      className="mt-auto w-full"
                      disabled={importingId === template.id}
                      onClick={() => void handleImportSaved(template.id)}
                    >
                      {importingId === template.id ? <Loader2 className="animate-spin" /> : "Import"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
