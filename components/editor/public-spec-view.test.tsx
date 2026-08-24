// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { PublicSpecView } from "./public-spec-view"

describe("PublicSpecView", () => {
  it("renders Markdown as real formatted HTML, not an unrendered dump", () => {
    render(<PublicSpecView markdown={"# Title\n\nSome **bold** body text."} />)

    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument()
    expect(screen.getByText("bold")).toBeInTheDocument()
    expect(screen.queryByText(/^# Title/)).not.toBeInTheDocument()
  })

  it("renders a list as real <ul>/<li> elements", () => {
    render(<PublicSpecView markdown={"- one\n- two"} />)

    expect(screen.getByRole("list")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
  })
})
