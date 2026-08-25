// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { CanvasSearchPopover } from "./canvas-search-popover"
import { DEFAULT_NODE_COLOR, DEFAULT_NODE_TEXT_COLOR, type CanvasNode } from "@/types/canvas"

function makeNode(id: string, label: string): CanvasNode {
  return {
    id,
    type: "canvasNode",
    position: { x: 0, y: 0 },
    data: { label, color: DEFAULT_NODE_COLOR, textColor: DEFAULT_NODE_TEXT_COLOR, shape: "rectangle" },
  }
}

function openSearch() {
  fireEvent.click(screen.getByRole("button", { name: /search nodes/i }))
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/search nodes by label/i), { target: { value } })
}

describe("CanvasSearchPopover", () => {
  it("renders a search icon trigger button", () => {
    render(<CanvasSearchPopover nodes={[]} onSelectNode={vi.fn()} />)
    expect(screen.getByRole("button", { name: /search nodes/i })).toBeInTheDocument()
  })

  it("shows no input until the trigger is clicked", () => {
    render(<CanvasSearchPopover nodes={[]} onSelectNode={vi.fn()} />)
    expect(screen.queryByPlaceholderText(/search nodes by label/i)).not.toBeInTheDocument()
  })

  it("shows a 'type to search' hint for an empty query, not the unfiltered node list", () => {
    const nodes = [makeNode("1", "API Gateway"), makeNode("2", "Database")]
    render(<CanvasSearchPopover nodes={nodes} onSelectNode={vi.fn()} />)

    openSearch()

    expect(screen.getByText(/type to search nodes/i)).toBeInTheDocument()
    expect(screen.queryByText("API Gateway")).not.toBeInTheDocument()
    expect(screen.queryByText("Database")).not.toBeInTheDocument()
  })

  it("live-filters nodes by case-insensitive substring match against data.label", () => {
    const nodes = [makeNode("1", "API Gateway"), makeNode("2", "Database"), makeNode("3", "Auth Service")]
    render(<CanvasSearchPopover nodes={nodes} onSelectNode={vi.fn()} />)

    openSearch()
    typeQuery("api")

    expect(screen.getByRole("button", { name: "API Gateway" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Database" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Auth Service" })).not.toBeInTheDocument()
  })

  it("shows a 'no matching nodes' message when the query matches nothing", () => {
    const nodes = [makeNode("1", "API Gateway")]
    render(<CanvasSearchPopover nodes={nodes} onSelectNode={vi.fn()} />)

    openSearch()
    typeQuery("zzz-no-match")

    expect(screen.getByText(/no matching nodes/i)).toBeInTheDocument()
  })

  it("skips nodes with an empty/untitled label", () => {
    const nodes = [makeNode("1", ""), makeNode("2", "Service A")]
    render(<CanvasSearchPopover nodes={nodes} onSelectNode={vi.fn()} />)

    openSearch()
    typeQuery("a")

    // Only the one real result ("Service A") renders as a result item —
    // the untitled node (empty label) never appears, and an empty query
    // never "matches" via substring search flooding the list with it.
    // `PopoverContent` renders into a portal appended to `document.body`, not
    // RTL's own `container` div — same reason `save-template-dialog.test.tsx`
    // queries from `document` rather than `container` for portaled content.
    expect(document.querySelectorAll("ul li")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Service A" })).toBeInTheDocument()
  })

  it("orders results by earliest match index first, then by label for ties", () => {
    // "Service B" and "Service A" both match "service" at index 0 — tie
    // breaks alphabetically. "Auth Service" matches "service" at index 5 —
    // sorts after both.
    const nodes = [makeNode("1", "Auth Service"), makeNode("2", "Service B"), makeNode("3", "Service A")]
    render(<CanvasSearchPopover nodes={nodes} onSelectNode={vi.fn()} />)

    openSearch()
    typeQuery("service")

    const results = screen.getAllByRole("button", { name: /service/i })
    expect(results.map((button) => button.textContent)).toEqual(["Service A", "Service B", "Auth Service"])
  })

  it("caps results at 20", () => {
    const nodes = Array.from({ length: 30 }, (_, index) => makeNode(`n${index}`, `Node ${index}`))
    render(<CanvasSearchPopover nodes={nodes} onSelectNode={vi.fn()} />)

    openSearch()
    typeQuery("node")

    expect(screen.getAllByRole("button", { name: /^Node \d+$/ })).toHaveLength(20)
  })

  it("calls onSelectNode with the full node, then closes and clears the query", () => {
    const nodes = [makeNode("1", "API Gateway")]
    const onSelectNode = vi.fn()
    render(<CanvasSearchPopover nodes={nodes} onSelectNode={onSelectNode} />)

    openSearch()
    typeQuery("api")
    fireEvent.click(screen.getByRole("button", { name: "API Gateway" }))

    expect(onSelectNode).toHaveBeenCalledWith(nodes[0])
    expect(screen.queryByPlaceholderText(/search nodes by label/i)).not.toBeInTheDocument()
  })

  it("clears the query when the popover is reopened after a selection", () => {
    const nodes = [makeNode("1", "API Gateway")]
    render(<CanvasSearchPopover nodes={nodes} onSelectNode={vi.fn()} />)

    openSearch()
    typeQuery("api")
    fireEvent.click(screen.getByRole("button", { name: "API Gateway" }))

    openSearch()
    expect(screen.getByPlaceholderText(/search nodes by label/i)).toHaveValue("")
  })
})
