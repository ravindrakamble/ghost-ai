"use client"

import { useMemo, useState, type ChangeEvent } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { CanvasNode } from "@/types/canvas"

/**
 * Cap on live-filtered search results shown in the popover — spec 36's own
 * literal number ("Results are capped at 20").
 */
const SEARCH_RESULTS_LIMIT = 20

export interface CanvasSearchPopoverProps {
  /**
   * The room's live `nodes` — the same `CanvasNode[]` array `CanvasFlow`
   * already holds via `useLiveblocksFlow`, threaded down through
   * `CanvasControlBar`. Matching is scoped to this array only (the current
   * room) — no cross-project/cross-room search, per spec 36's Scope Limit.
   */
  nodes: CanvasNode[]
  /**
   * `CanvasFlow`'s `handleJumpToNode` — called with the full selected node
   * once a result is chosen. This component itself never touches
   * `useReactFlow()`/`setCenter` or the highlight context; it only reports
   * *which* node was picked.
   */
  onSelectNode: (node: CanvasNode) => void
}

interface SearchMatch {
  node: CanvasNode
  matchIndex: number
}

/**
 * Case-insensitive substring match of `query` against each node's
 * `data.label`, ordered by earliest match index (ascending) then by label
 * (string comparison) for ties, capped at `SEARCH_RESULTS_LIMIT` — spec 36's
 * Analyst Brief, Concrete deliverables. Nodes with an empty/untitled label
 * are skipped when `query` is non-empty (an empty string always "matches" a
 * substring search and would otherwise flood results with every untitled
 * node). An empty/whitespace-only query returns no results at all — see
 * spec 36's Analyst Brief, Open Questions #4 — rather than the unbounded,
 * unordered full node list.
 */
function findMatches(nodes: CanvasNode[], query: string): SearchMatch[] {
  const trimmedQuery = query.trim()
  if (trimmedQuery === "") {
    return []
  }

  const lowerQuery = trimmedQuery.toLowerCase()
  const matches: SearchMatch[] = []

  for (const node of nodes) {
    const label = node.data.label
    if (!label) continue

    const matchIndex = label.toLowerCase().indexOf(lowerQuery)
    if (matchIndex === -1) continue

    matches.push({ node, matchIndex })
  }

  matches.sort((a, b) => {
    if (a.matchIndex !== b.matchIndex) {
      return a.matchIndex - b.matchIndex
    }
    const labelA = a.node.data.label
    const labelB = b.node.data.label
    if (labelA < labelB) return -1
    if (labelA > labelB) return 1
    return 0
  })

  return matches.slice(0, SEARCH_RESULTS_LIMIT)
}

/**
 * The self-contained canvas node search control — a `PopoverTrigger` styled
 * as an icon button (matching every other `CanvasControlBar` button) plus a
 * `PopoverContent` holding a text `Input` and the live-filtered result list.
 * Not the shadcn `Command` component — see spec 36's Analyst Brief, Concrete
 * deliverables, "Popover, not Command."
 *
 * Owns its own local `query`/open state (nothing outside this component
 * needs to read them) and computes matches via a `useMemo` over the `nodes`
 * prop. Selecting a result calls `onSelectNode`, then closes the popover and
 * clears the query — so reopening the popover always starts from a blank
 * search rather than the previous one.
 */
export function CanvasSearchPopover({ nodes, onSelectNode }: CanvasSearchPopoverProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const results = useMemo(() => findMatches(nodes, query), [nodes, query])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery("")
    }
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value)
  }

  function handleSelect(node: CanvasNode) {
    onSelectNode(node)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon-lg" title="Search nodes" aria-label="Search nodes" />}
      >
        <Search />
      </PopoverTrigger>
      <PopoverContent align="start" side="top">
        <Input
          autoFocus
          value={query}
          onChange={handleQueryChange}
          placeholder="Search nodes by label…"
          aria-label="Search nodes by label"
          className="text-copy-primary"
        />
        <div className="max-h-64 overflow-y-auto">
          {query.trim() === "" ? (
            <p className="px-1 py-2 text-xs text-copy-muted">Type to search nodes.</p>
          ) : results.length === 0 ? (
            <p className="px-1 py-2 text-xs text-copy-muted">No matching nodes.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map(({ node }) => (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(node)}
                    className="w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-copy-primary transition-colors hover:bg-subtle"
                  >
                    {node.data.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
