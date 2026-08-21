// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { SaveStatusIndicator } from "./save-status-indicator"

describe("SaveStatusIndicator", () => {
  it("renders nothing for the idle status", () => {
    const { container } = render(<SaveStatusIndicator status="idle" />)

    expect(container).toBeEmptyDOMElement()
  })

  it("shows a Saving… label while saving", () => {
    render(<SaveStatusIndicator status="saving" />)

    expect(screen.getByText(/saving/i)).toBeInTheDocument()
  })

  it("shows a Saved label once saved", () => {
    render(<SaveStatusIndicator status="saved" />)

    expect(screen.getByText("Saved")).toBeInTheDocument()
  })

  it("shows a Save failed label on error", () => {
    render(<SaveStatusIndicator status="error" />)

    expect(screen.getByText(/save failed/i)).toBeInTheDocument()
  })
})
