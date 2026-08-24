"use client"

import { useCallback, useState } from "react"

interface PublicLinkGetResponse {
  token?: string | null
  error?: string
}

interface PublicLinkPostResponse {
  token?: string
  error?: string
}

/** Parses a public-link route's JSON response, tolerating an empty/invalid body. */
async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    return {} as T
  }
}

/**
 * Owns fetch/generate/revoke calls and loading/error state for a project's
 * public share link, backing `ShareDialog`'s new "Public link" section
 * (spec 34). Structurally mirrors `hooks/use-collaborators.ts` — same
 * `{ ..., isLoading, error, refetch }` shape, and the same deliberate
 * absence of an internal `useEffect` auto-fetch (see that hook's own
 * docblock for the `react-hooks/set-state-in-effect` reasoning). `refetch`
 * is called from `WorkspaceShell`'s existing `handleOpenShare` handler,
 * alongside the collaborators `refetch()` it already calls, and only when
 * `isOwner` — collaborators have no reason to hit an endpoint that will
 * 403 them (this spec's own explicit Scope Limit).
 */
export function usePublicLink(projectId: string) {
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRevoking, setIsRevoking] = useState(false)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/public-link`)
      const body = await parseJson<PublicLinkGetResponse>(response)

      if (!response.ok) {
        setError(body.error ?? "Failed to load the public link.")
        return
      }

      setToken(body.token ?? null)
    } catch {
      setError("Failed to load the public link. Please check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  const generate = useCallback(async (): Promise<boolean> => {
    setIsGenerating(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/public-link`, { method: "POST" })
      const body = await parseJson<PublicLinkPostResponse>(response)

      if (!response.ok || !body.token) {
        setError(body.error ?? "Failed to generate a public link.")
        return false
      }

      setToken(body.token)
      return true
    } catch {
      setError("Failed to generate a public link. Please check your connection and try again.")
      return false
    } finally {
      setIsGenerating(false)
    }
  }, [projectId])

  const revoke = useCallback(async (): Promise<boolean> => {
    setIsRevoking(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/public-link`, { method: "DELETE" })

      if (!response.ok) {
        const body = await parseJson<{ error?: string }>(response)
        setError(body.error ?? "Failed to revoke the public link.")
        return false
      }

      setToken(null)
      return true
    } catch {
      setError("Failed to revoke the public link. Please check your connection and try again.")
      return false
    } finally {
      setIsRevoking(false)
    }
  }, [projectId])

  return {
    token,
    isLoading,
    error,
    isGenerating,
    isRevoking,
    refetch,
    generate,
    revoke,
  }
}
