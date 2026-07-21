export type ProjectRole = "owner" | "collaborator"

export interface Project {
  id: string
  name: string
  slug: string
  role: ProjectRole
}
