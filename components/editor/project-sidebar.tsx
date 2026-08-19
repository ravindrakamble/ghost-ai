"use client"

import { Pencil, Plus, Trash2, X } from "lucide-react"
import { useParams } from "next/navigation"
import { useProjectDialogsContext } from "@/components/editor/project-dialogs-provider"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Project } from "@/types/project"

interface ProjectSidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function ProjectSidebar({ isOpen, onClose }: ProjectSidebarProps) {
  const { ownedProjects, sharedProjects, openCreateDialog, openRenameDialog, openDeleteDialog } =
    useProjectDialogsContext()
  // Rendered above the `[roomId]` segment, but `useParams()` still reads it —
  // same precedent as `hooks/use-project-actions.ts` (see spec 07's Dev Notes).
  const { roomId } = useParams<{ roomId?: string }>()

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        className={`fixed inset-0 z-20 bg-black/60 transition-opacity duration-200 md:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`fixed left-0 top-0 z-30 flex h-full w-64 flex-col border-r border-surface-border bg-elevated transition-transform duration-200 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-4">
          <span className="text-sm font-semibold text-copy-primary">Projects</span>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
            <span className="sr-only">Close sidebar</span>
          </Button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <Tabs defaultValue="my-projects" className="flex flex-1 flex-col">
            <TabsList className="w-full">
              <TabsTrigger value="my-projects" className="flex-1">
                My Projects
              </TabsTrigger>
              <TabsTrigger value="shared" className="flex-1">
                Shared
              </TabsTrigger>
            </TabsList>

            <TabsContent value="my-projects" className="flex flex-col gap-0.5 overflow-y-auto py-1">
              {ownedProjects.length === 0 ? (
                <p className="flex flex-1 items-center justify-center text-sm text-copy-muted">
                  No projects yet.
                </p>
              ) : (
                ownedProjects.map((project) => (
                  <ProjectItem
                    key={project.id}
                    project={project}
                    isActive={project.id === roomId}
                    onRename={() => openRenameDialog(project)}
                    onDelete={() => openDeleteDialog(project)}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="shared" className="flex flex-col gap-0.5 overflow-y-auto py-1">
              {sharedProjects.length === 0 ? (
                <p className="flex flex-1 items-center justify-center text-sm text-copy-muted">
                  No shared projects.
                </p>
              ) : (
                sharedProjects.map((project) => (
                  <div
                    key={project.id}
                    className={`truncate rounded-lg px-2 py-1.5 text-sm ${
                      project.id === roomId
                        ? "bg-accent-dim text-brand"
                        : "text-copy-primary"
                    }`}
                  >
                    {project.name}
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="shrink-0 border-t border-surface-border p-3">
          <Button className="w-full gap-2" onClick={openCreateDialog}>
            <Plus />
            New Project
          </Button>
        </div>
      </aside>
    </>
  )
}

function ProjectItem({
  project,
  isActive,
  onRename,
  onDelete,
}: {
  project: Project
  isActive: boolean
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={`group flex items-center justify-between rounded-lg px-2 py-1.5 ${
        isActive ? "bg-accent-dim" : "hover:bg-subtle"
      }`}
    >
      <span
        className={`truncate text-sm ${isActive ? "text-brand" : "text-copy-primary"}`}
      >
        {project.name}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
        <Button variant="ghost" size="icon-sm" onClick={onRename}>
          <Pencil />
          <span className="sr-only">Rename {project.name}</span>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <Trash2 />
          <span className="sr-only">Delete {project.name}</span>
        </Button>
      </div>
    </div>
  )
}
