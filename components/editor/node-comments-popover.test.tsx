// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { NodeCommentsPopover } from "./node-comments-popover"
import type { NodeComment } from "@/types/tasks"

const { useNodeCommentsForNodeMock } = vi.hoisted(() => ({
  useNodeCommentsForNodeMock: vi.fn(),
}))

vi.mock("@/hooks/use-node-comments", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-node-comments")>(
    "@/hooks/use-node-comments",
  )
  return {
    ...actual,
    useNodeCommentsForNode: useNodeCommentsForNodeMock,
  }
})

function makeComment(overrides: Partial<NodeComment> = {}): NodeComment {
  return {
    id: "c1",
    nodeId: "node-1",
    sender: "Ada",
    content: "Looks good",
    timestamp: Date.UTC(2024, 0, 1, 12, 0),
    ...overrides,
  }
}

function openPopover(name: RegExp | string) {
  fireEvent.click(screen.getByRole("button", { name }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("NodeCommentsPopover", () => {
  it("renders an icon-only trigger, hidden at rest, when the node has zero comments", () => {
    useNodeCommentsForNodeMock.mockReturnValue({ comments: [], sendComment: vi.fn() })

    render(<NodeCommentsPopover nodeId="node-1" />)

    const trigger = screen.getByRole("button", { name: "Add a comment" })
    expect(trigger).toBeInTheDocument()
    expect(trigger.className).toContain("opacity-0")
    expect(trigger.className).toContain("group-hover:opacity-100")
    expect(trigger).not.toHaveTextContent(/\d/)
  })

  it("renders a persistently visible trigger with a numeric count badge once the node has comments", () => {
    useNodeCommentsForNodeMock.mockReturnValue({
      comments: [makeComment({ id: "c1" }), makeComment({ id: "c2" })],
      sendComment: vi.fn(),
    })

    render(<NodeCommentsPopover nodeId="node-1" />)

    const trigger = screen.getByRole("button", { name: "View 2 comments" })
    expect(trigger.className).toContain("opacity-100")
    expect(trigger.className).not.toContain("opacity-0")
    expect(trigger).toHaveTextContent("2")
  })

  it("carries nodrag/nopan so clicking the trigger never starts a node drag", () => {
    useNodeCommentsForNodeMock.mockReturnValue({ comments: [], sendComment: vi.fn() })

    render(<NodeCommentsPopover nodeId="node-1" />)

    const trigger = screen.getByRole("button", { name: "Add a comment" })
    expect(trigger.className).toContain("nodrag")
    expect(trigger.className).toContain("nopan")
  })

  it("shows 'No comments yet.' and a reachable reply input when the node has zero comments", () => {
    useNodeCommentsForNodeMock.mockReturnValue({ comments: [], sendComment: vi.fn() })

    render(<NodeCommentsPopover nodeId="node-1" />)
    openPopover("Add a comment")

    expect(screen.getByText("No comments yet.")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Write a comment…")).toBeInTheDocument()
  })

  it("renders the thread in chronological order, scoped only to this node's own comments", () => {
    const comments = [
      makeComment({ id: "c1", sender: "Ada", content: "First" }),
      makeComment({ id: "c2", sender: "Bob", content: "Second" }),
    ]
    useNodeCommentsForNodeMock.mockReturnValue({ comments, sendComment: vi.fn() })

    render(<NodeCommentsPopover nodeId="node-1" />)
    openPopover("View 2 comments")

    const bubbles = screen.getAllByText(/First|Second/)
    expect(bubbles.map((el) => el.textContent)).toEqual(["First", "Second"])
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
  })

  it("calls sendComment(content) on Send click and clears the draft", () => {
    const sendComment = vi.fn()
    useNodeCommentsForNodeMock.mockReturnValue({ comments: [], sendComment })

    render(<NodeCommentsPopover nodeId="node-1" />)
    openPopover("Add a comment")

    const textarea = screen.getByPlaceholderText("Write a comment…")
    fireEvent.change(textarea, { target: { value: "A new comment" } })
    fireEvent.click(screen.getByRole("button", { name: "Send comment" }))

    expect(sendComment).toHaveBeenCalledWith("A new comment")
    expect(textarea).toHaveValue("")
  })

  it("submits on Enter without Shift, and inserts a newline on Shift+Enter", () => {
    const sendComment = vi.fn()
    useNodeCommentsForNodeMock.mockReturnValue({ comments: [], sendComment })

    render(<NodeCommentsPopover nodeId="node-1" />)
    openPopover("Add a comment")

    const textarea = screen.getByPlaceholderText("Write a comment…")
    fireEvent.change(textarea, { target: { value: "typed reply" } })
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true })
    expect(sendComment).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false })
    expect(sendComment).toHaveBeenCalledWith("typed reply")
  })

  it("does not submit an empty/whitespace-only draft", () => {
    const sendComment = vi.fn()
    useNodeCommentsForNodeMock.mockReturnValue({ comments: [], sendComment })

    render(<NodeCommentsPopover nodeId="node-1" />)
    openPopover("Add a comment")

    const textarea = screen.getByPlaceholderText("Write a comment…")
    fireEvent.change(textarea, { target: { value: "   " } })
    expect(screen.getByRole("button", { name: "Send comment" })).toBeDisabled()

    fireEvent.keyDown(textarea, { key: "Enter" })
    expect(sendComment).not.toHaveBeenCalled()
  })
})
