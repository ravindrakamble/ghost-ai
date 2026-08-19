import { EditorHomeEmptyState } from "@/components/editor/editor-home-empty-state"

export default function EditorPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-base px-4 text-center">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold text-copy-primary">
          Create a project or open an existing one
        </h1>
        <p className="text-sm text-copy-muted">
          Start a new architecture workspace, or choose a project from the sidebar.
        </p>
      </div>
      <EditorHomeEmptyState />
    </div>
  )
}
