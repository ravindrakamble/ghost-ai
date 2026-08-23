"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { generateShortSuffix, slugify } from "@/lib/slug"
import type { Project } from "@/types/project"

type DialogType = "create" | "rename" | "delete" | null

interface ProjectApiResponse {
  project?: { id: string; name: string }
  error?: string
}

/**
 * Parses a project mutation route's JSON response. Falls back to a generic
 * message if the body isn't valid JSON (e.g. an upstream 500 with no body).
 */
async function parseProjectResponse(response: Response): Promise<ProjectApiResponse> {
  try {
    return (await response.json()) as ProjectApiResponse
  } catch {
    return {}
  }
}

/**
 * Owns dialog state and the real create/rename/delete mutations for the
 * editor home sidebar and dialogs. Replaces the mock `useProjectDialogs`
 * hook from spec 04 — see spec 07.
 */
export function useProjectActions() {
  const router = useRouter()
  const params = useParams<{ roomId?: string }>()

  const [dialogType, setDialogType] = useState<DialogType>(null)
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [name, setName] = useState("")
  const [roomIdSuffix, setRoomIdSuffix] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slug = slugify(name)
  // Cosmetic, room-ID-style preview only — the real ID is server-generated.
  // See lib/slug.ts and spec 07's Open Questions #2.
  const roomIdPreview = slug ? `${slug}-${roomIdSuffix}` : ""

  function closeDialog() {
    setDialogType(null)
    setActiveProject(null)
    setName("")
    setError(null)
  }

  function openCreateDialog() {
    setActiveProject(null)
    setName("")
    setRoomIdSuffix(generateShortSuffix())
    setError(null)
    setDialogType("create")
  }

  function openRenameDialog(project: Project) {
    setActiveProject(project)
    setName(project.name)
    setError(null)
    setDialogType("rename")
  }

  function openDeleteDialog(project: Project) {
    setActiveProject(project)
    setError(null)
    setDialogType("delete")
  }

  async function submitCreate() {
    const trimmedName = name.trim()
    if (!trimmedName || isLoading) return

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      })
      const body = await parseProjectResponse(response)

      if (!response.ok || !body.project) {
        setError(body.error ?? "Failed to create project. Please try again.")
        return
      }

      const createdProjectId = body.project.id
      closeDialog()
      // `ownedProjects`/`sharedProjects` (`ProjectSidebar`'s list) are fetched
      // server-side in `app/editor/layout.tsx`, a layout shared by every
      // `/editor/*` route -- Next.js reuses that already-rendered layout
      // across a sibling navigation like this one, so without an explicit
      // `router.refresh()` the sidebar keeps showing its stale pre-create
      // list. `refresh()` must come *after* `push()`: called first, it
      // invalidates the route we're about to leave, not the one we're
      // navigating to, and that invalidation loses the race against the
      // navigation itself -- confirmed live (the list stayed stale with the
      // reverse order). Called after `push()`, it invalidates whatever the
      // router now considers the current route tree, which by then is the
      // new project's -- including the shared layout above it.
      router.push(`/editor/${createdProjectId}`)
      router.refresh()
    } catch {
      setError("Failed to create project. Please check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  async function submitRename() {
    const trimmedName = name.trim()
    if (!activeProject || !trimmedName || isLoading) return

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${activeProject.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      })

      if (!response.ok) {
        const body = await parseProjectResponse(response)
        setError(body.error ?? "Failed to rename project. Please try again.")
        return
      }

      closeDialog()
      router.refresh()
    } catch {
      setError("Failed to rename project. Please check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  async function submitDelete() {
    if (!activeProject || isLoading) return

    const deletedProjectId = activeProject.id
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${deletedProjectId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const body = await parseProjectResponse(response)
        setError(body.error ?? "Failed to delete project. Please try again.")
        return
      }

      closeDialog()

      // "Active workspace" is the project currently open at `/editor/
      // [roomId]` — deleting it can't leave the caller on a now-nonexistent
      // room, so this navigates home first. `router.refresh()` still runs
      // either way (same reasoning as `submitCreate` above: called after
      // `push()` so it invalidates the route just navigated *to*, refetching
      // the shared layout's stale project list along with it) — deleting the
      // active project without it would leave the sidebar still showing the
      // just-deleted project once reopened.
      const isActiveWorkspace = params?.roomId === deletedProjectId
      if (isActiveWorkspace) {
        router.push("/editor")
      }
      router.refresh()
    } catch {
      setError("Failed to delete project. Please check your connection and try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return {
    dialogType,
    activeProject,
    name,
    slug,
    roomIdPreview,
    isLoading,
    error,
    setName,
    openCreateDialog,
    openRenameDialog,
    openDeleteDialog,
    closeDialog,
    submitCreate,
    submitRename,
    submitDelete,
  }
}
