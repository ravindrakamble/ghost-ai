"use client"

import { useState } from "react"
import { Check, Copy, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Collaborator } from "@/types/collaborator"

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  isOwner: boolean
  collaborators: Collaborator[]
  isLoading: boolean
  error: string | null
  isInviting: boolean
  removingId: string | null
  onInvite: (email: string) => Promise<boolean>
  onRemove: (collaboratorId: string) => Promise<boolean>
}

/** First letter of the display name, or the email, uppercased — avatar fallback. */
function initialFor(collaborator: Collaborator): string {
  const source = collaborator.name ?? collaborator.email
  return source.charAt(0).toUpperCase()
}

function CollaboratorAvatar({ collaborator }: { collaborator: Collaborator }) {
  if (collaborator.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Clerk-hosted avatar URL, not a local/optimizable asset
      <img
        src={collaborator.avatarUrl}
        alt=""
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    )
  }

  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-dim text-xs font-semibold text-brand">
      {initialFor(collaborator)}
    </div>
  )
}

/**
 * Share dialog: owners can invite/remove collaborators by email and copy the
 * project link; collaborators get read-only visibility of the same list.
 * `isOwner` only controls which controls render — the real security
 * boundary is server-side in the invite/remove route handlers.
 *
 * Presentational only — collaborator data and mutations are owned by
 * `hooks/use-collaborators.ts` and passed down from `WorkspaceShell`, which
 * also triggers the initial fetch from the Share button's click handler
 * (not from an effect here — see that hook's doc comment).
 */
export function ShareDialog({
  open,
  onOpenChange,
  projectId,
  isOwner,
  collaborators,
  isLoading,
  error,
  isInviting,
  removingId,
  onInvite,
  onRemove,
}: ShareDialogProps) {
  const [email, setEmail] = useState("")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  // Every close path (Escape, backdrop click, the dialog's own close
  // button) routes through this callback, so resetting transient local
  // state here — rather than in a `useEffect` watching `open` — covers all
  // of them without an effect-driven setState.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEmail("")
      setInviteError(null)
      setIsCopied(false)
    }
    onOpenChange(nextOpen)
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || isInviting) return

    setInviteError(null)
    const success = await onInvite(trimmed)
    if (success) {
      setEmail("")
    }
  }

  async function handleCopyLink() {
    const link = `${window.location.origin}/editor/${projectId}`
    try {
      await navigator.clipboard.writeText(link)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      setInviteError("Couldn't copy the link. Please copy it manually from the address bar.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-copy-primary">Share project</DialogTitle>
          <DialogDescription className="text-copy-secondary">
            {isOwner
              ? "Invite collaborators by email and manage who has access."
              : "People with access to this project."}
          </DialogDescription>
        </DialogHeader>

        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-1.5"
          onClick={() => void handleCopyLink()}
        >
          {isCopied ? <Check /> : <Copy />}
          {isCopied ? "Copied!" : "Copy project link"}
        </Button>

        {isOwner && (
          <form onSubmit={(event) => void handleInvite(event)} className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="text-copy-primary"
                aria-label="Collaborator email"
              />
              <Button type="submit" disabled={!email.trim() || isInviting}>
                {isInviting ? <Loader2 className="animate-spin" /> : "Invite"}
              </Button>
            </div>
            {inviteError && <p className="text-xs text-state-error">{inviteError}</p>}
          </form>
        )}

        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-copy-muted">
            {collaborators.length === 1 ? "1 collaborator" : `${collaborators.length} collaborators`}
          </p>

          {error && <p className="text-xs text-state-error">{error}</p>}

          {isLoading ? (
            <p className="py-4 text-center text-sm text-copy-muted">Loading collaborators…</p>
          ) : collaborators.length === 0 ? (
            <p className="py-4 text-center text-sm text-copy-muted">No collaborators yet.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {collaborators.map((collaborator) => (
                <li
                  key={collaborator.id}
                  className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5"
                >
                  <CollaboratorAvatar collaborator={collaborator} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-copy-primary">
                      {collaborator.name ?? collaborator.email}
                    </p>
                    {collaborator.name && (
                      <p className="truncate text-xs text-copy-muted">{collaborator.email}</p>
                    )}
                  </div>
                  {isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={removingId === collaborator.id}
                      onClick={() => void onRemove(collaborator.id)}
                      aria-label={`Remove ${collaborator.name ?? collaborator.email}`}
                    >
                      {removingId === collaborator.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <X />
                      )}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
