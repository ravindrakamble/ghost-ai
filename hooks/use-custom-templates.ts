"use client"

import { useCallback, useEffect, useState } from "react"

/** A single saved template's list-item metadata, matching the shape
 * `GET /api/templates` (spec 33) returns. */
export interface CustomTemplateSummary {
  id: string
  name: string
  description: string | null
  createdAt: string
}

interface TemplatesListResponse {
  templates?: CustomTemplateSummary[]
  error?: string
}

/** Parses a templates route's JSON response, tolerating an empty/invalid body. */
async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    return {} as T
  }
}

/**
 * Fetches the current user's saved template list (`GET /api/templates`, spec
 * 33) on mount and exposes loading/error state plus a `refetch` escape
 * hatch, mirroring `hooks/use-project-specs.ts`'s exact fetch-and-`useState`
 * shape — no `projectId` argument since a saved template isn't
 * project-scoped. Adds a `remove(templateId)` mutation mirroring
 * `hooks/use-collaborators.ts`'s `remove()`: tracks its own `removingId`,
 * calls `DELETE /api/templates/[templateId]`, and optimistically filters the
 * deleted row out of local state on success — the raw spec's own explicit
 * "Add a delete action per saved template card" requirement, which needs to
 * live somewhere with access to the list state it mutates (spec 33's
 * Analyst Brief, Concrete deliverables).
 *
 * Component-local state only, per `architecture-context.md`'s Hooks
 * Convention — no Context, no module-level store.
 */
export function useCustomTemplates() {
  const [templates, setTemplates] = useState<CustomTemplateSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      try {
        const response = await fetch("/api/templates")
        const body = await parseJson<TemplatesListResponse>(response)
        if (cancelled) return

        if (!response.ok || !body.templates) {
          setTemplates([])
          setError(body.error ?? "Failed to load your saved templates.")
          return
        }

        setTemplates(body.templates)
        setError(null)
      } catch {
        if (!cancelled) {
          setTemplates([])
          setError("Failed to load your saved templates. Please check your connection and try again.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadTemplates()

    return () => {
      cancelled = true
    }
  }, [version])

  const refetch = useCallback(() => {
    setIsLoading(true)
    setVersion((current) => current + 1)
  }, [])

  const remove = useCallback(async (templateId: string): Promise<boolean> => {
    setRemovingId(templateId)
    setError(null)
    try {
      const response = await fetch(`/api/templates/${templateId}`, { method: "DELETE" })

      if (!response.ok) {
        const body = await parseJson<{ error?: string }>(response)
        setError(body.error ?? "Failed to delete the template.")
        return false
      }

      setTemplates((prev) => prev.filter((template) => template.id !== templateId))
      return true
    } catch {
      setError("Failed to delete the template. Please check your connection and try again.")
      return false
    } finally {
      setRemovingId(null)
    }
  }, [])

  return { templates, isLoading, error, removingId, refetch, remove }
}
