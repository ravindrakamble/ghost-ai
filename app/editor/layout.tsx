import { EditorShell } from "@/components/editor/editor-shell"
import { getProjectsForUser } from "@/lib/projects"

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { owned, shared } = await getProjectsForUser()

  return (
    <EditorShell ownedProjects={owned} sharedProjects={shared}>
      {children}
    </EditorShell>
  )
}
