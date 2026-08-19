"use client"

import { useCallback, useState } from "react"
import type { Collaborator } from "@/types/collaborator"

interface CollaboratorsListResponse {
  collaborators?: Collaborator[]
  error?: string
}

interface CollaboratorInviteResponse {
  collaborator?: Collaborator
  error?: string
}

/** Parses a collaborators route's JSON response, tolerating an empty/invalid body. */
async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    return {} as T
  }
}

/**
 * Owns fetch/invite/remove calls and loading/error state for a project's
 * collaborator list, backing `ShareDialog`. New hooks live in the top-level
 * `hooks/` folder per `architecture-context.md`'s Hooks Convention.
 *
 * Deliberately has no internal `useEffect` auto-fetch: the caller triggers
 * `refetch()` from the event handler that opens the Share dialog (e.g. the
 * navbar's Share button `onClick`). Fetching-on-mount-via-effect was tried
 * first but flagged by `react-hooks/set-state-in-effect` — calling this
 * hook's own `setIsLoading(true)` synchronously at the top of an
 * effect-triggered fetch is exactly the "cascading render" pattern that
 * rule exists to catch, and the React-recommended fix is to move the
 * trigger to the originating event handler rather than watching a prop.
 */
export function useCollaborators(projectId: string) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isInviting, setIsInviting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/collaborators`)
      const body = await parseJson<CollaboratorsListResponse>(response)

      if (!response.ok || !body.collaborators) {
        setError(body.error ?? "Failed to load collaborators.")
        return
      }

      setCollaborators(body.collaborators)
    } catch {
      setError("Failed to load collaborators. Please check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  const invite = useCallback(
    async (email: string): Promise<boolean> => {
      setIsInviting(true)
      setError(null)
      try {
        const response = await fetch(`/api/projects/${projectId}/collaborators`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        })
        const body = await parseJson<CollaboratorInviteResponse>(response)

        if (!response.ok || !body.collaborator) {
          setError(body.error ?? "Failed to invite collaborator.")
          return false
        }

        const invited = body.collaborator
        setCollaborators((prev) => [...prev, invited])
        return true
      } catch {
        setError("Failed to invite collaborator. Please check your connection and try again.")
        return false
      } finally {
        setIsInviting(false)
      }
    },
    [projectId]
  )

  const remove = useCallback(
    async (collaboratorId: string): Promise<boolean> => {
      setRemovingId(collaboratorId)
      setError(null)
      try {
        const response = await fetch(
          `/api/projects/${projectId}/collaborators/${collaboratorId}`,
          { method: "DELETE" }
        )

        if (!response.ok) {
          const body = await parseJson<{ error?: string }>(response)
          setError(body.error ?? "Failed to remove collaborator.")
          return false
        }

        setCollaborators((prev) => prev.filter((collaborator) => collaborator.id !== collaboratorId))
        return true
      } catch {
        setError("Failed to remove collaborator. Please check your connection and try again.")
        return false
      } finally {
        setRemovingId(null)
      }
    },
    [projectId]
  )

  return {
    collaborators,
    isLoading,
    error,
    isInviting,
    removingId,
    invite,
    remove,
    refetch,
  }
}
