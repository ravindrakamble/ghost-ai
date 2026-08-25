// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { SpecPreviewModal } from "./spec-preview-modal"
import type { ProjectSpecSummary } from "@/hooks/use-project-specs"

const fetchMock = vi.fn()

const SPEC: ProjectSpecSummary = {
  id: "spec-1",
  filename: "spec-spec-1.md",
  createdAt: "2026-01-01T00:00:00.000Z",
  hasIac: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("SpecPreviewModal", () => {
  it("renders nothing when spec is null", () => {
    render(<SpecPreviewModal projectId="p1" spec={null} onOpenChange={vi.fn()} />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("fetches the spec's Markdown content through the download route via fetch()", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "# Hello\n\nSome body text." })

    render(<SpecPreviewModal projectId="p1" spec={SPEC} onOpenChange={vi.fn()} />)

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/specs/spec-1/download")

    // Rendered as real formatted Markdown, not a raw `<pre>{markdown}</pre>` dump.
    const heading = await screen.findByRole("heading", { name: "Hello" })
    expect(heading.tagName).toBe("H1")
    expect(screen.getByText("Some body text.")).toBeInTheDocument()
  })

  it("shows a loading state before the fetch resolves", () => {
    fetchMock.mockReturnValue(new Promise(() => {})) // never resolves

    render(<SpecPreviewModal projectId="p1" spec={SPEC} onOpenChange={vi.fn()} />)

    expect(screen.getByText(/loading spec/i)).toBeInTheDocument()
  })

  it("shows an inline error, not a crash, when the fetch fails (non-OK response)", async () => {
    fetchMock.mockResolvedValue({ ok: false, text: async () => "" })

    render(<SpecPreviewModal projectId="p1" spec={SPEC} onOpenChange={vi.fn()} />)

    expect(await screen.findByText(/failed to load this spec/i)).toBeInTheDocument()
  })

  it("shows an inline error when fetch itself throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"))

    render(<SpecPreviewModal projectId="p1" spec={SPEC} onOpenChange={vi.fn()} />)

    expect(await screen.findByText(/failed to load this spec/i)).toBeInTheDocument()
  })

  it("renders a real <a href download> download action pointed at the download route", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "content" })

    render(<SpecPreviewModal projectId="p1" spec={SPEC} onOpenChange={vi.fn()} />)

    const downloadLink = await screen.findByRole("link", { name: /download/i })
    expect(downloadLink).toHaveAttribute("href", "/api/projects/p1/specs/spec-1/download")
    expect(downloadLink).toHaveAttribute("download")
  })

  it("shows the spec's filename in the dialog title", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "content" })

    render(<SpecPreviewModal projectId="p1" spec={SPEC} onOpenChange={vi.fn()} />)

    expect(screen.getByText(SPEC.filename)).toBeInTheDocument()
  })

  it("calls onOpenChange when the dialog's own close control is used", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "content" })
    const onOpenChange = vi.fn()

    render(<SpecPreviewModal projectId="p1" spec={SPEC} onOpenChange={onOpenChange} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    screen.getByRole("button", { name: /close/i }).click()

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
