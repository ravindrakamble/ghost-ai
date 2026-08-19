import { Lock } from "lucide-react"
import Link from "next/link"

/**
 * Rendered by `/editor/[roomId]` when the project doesn't exist or the
 * signed-in caller is neither the owner nor a collaborator. Presentational
 * only — no client interactivity required.
 */
export function AccessDenied() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-base px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-subtle">
        <Lock className="h-8 w-8 text-copy-muted" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-semibold text-copy-primary">Access denied</h1>
        <p className="text-sm text-copy-muted">
          This project doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
      <Link href="/editor" className="text-sm font-medium text-brand hover:underline">
        Back to editor
      </Link>
    </div>
  )
}
