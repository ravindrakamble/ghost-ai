"use client"

import { useCallback, useEffect, useState } from "react"

/** A single generated spec's list-item metadata, matching the shape
 * `GET /api/projects/[projectId]/specs` (spec 28) returns. */
export interface ProjectSpecSummary {
  id: string
  filename: string
  createdAt: string
}

interface SpecsListResponse {
  specs?: ProjectSpecSummary[]
  error?: string
}

/** Parses a specs-list route's JSON response, tolerating an empty/invalid body. */
async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    return {} as T
  }
}

/**
 * Fetches a project's spec list (spec 29's `GET
 * /api/projects/[projectId]/specs`, spec 28) on mount and exposes
 * loading/error state plus a `refetch` escape hatch. Component-local state
 * only -- a plain fetch-and-`useState` hook per `architecture-context.md`'s
 * Hooks Convention -- no Context, no module-level store (the Scope Limit
 * this spec's brief calls out).
 *
 * The mount/refetch fetch is driven by a `version` counter dependency
 * rather than calling `setIsLoading(true)` synchronously as the first
 * statement of the effect body -- mirroring `components/editor/canvas.tsx`'s
 * proven initial-load effect shape (spec 21), where every state update
 * happens only after the `fetch` call's own `await`. See
 * `hooks/use-collaborators.ts`'s doc comment for why an eager,
 * pre-`await` `setIsLoading(true)` inside an effect body gets flagged by
 * `react-hooks/set-state-in-effect` -- `refetch` below sets it from an
 * event handler instead, which is not subject to that rule.
 */
export function useProjectSpecs(projectId: string) {
  const [specs, setSpecs] = useState<ProjectSpecSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadSpecs() {
      try {
        const response = await fetch(`/api/projects/${projectId}/specs`)
        const body = await parseJson<SpecsListResponse>(response)
        if (cancelled) return

        if (!response.ok || !body.specs) {
          setSpecs([])
          setError(body.error ?? "Failed to load specs.")
          return
        }

        setSpecs(body.specs)
        setError(null)
      } catch {
        if (!cancelled) {
          setSpecs([])
          setError("Failed to load specs. Please check your connection and try again.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadSpecs()

    return () => {
      cancelled = true
    }
  }, [projectId, version])

  const refetch = useCallback(() => {
    setIsLoading(true)
    setVersion((current) => current + 1)
  }, [])

  return { specs, isLoading, error, refetch }
}
