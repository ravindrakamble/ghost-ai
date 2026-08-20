// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, within } from "@testing-library/react"
import { ShapeVisual } from "./shape-visual"
import { CANVAS_SHAPES } from "@/lib/canvas-shapes"

describe("ShapeVisual", () => {
  it.each(CANVAS_SHAPES)("renders %s without throwing and fills its container", (shape) => {
    const { container } = render(<ShapeVisual shape={shape} color="#1F1F1F" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain("h-full")
    expect(root.className).toContain("w-full")
  })

  it("renders rectangle/pill/circle as a CSS div with the fill color and no SVG", () => {
    for (const shape of ["rectangle", "pill", "circle"] as const) {
      const { container } = render(<ShapeVisual shape={shape} color="#10233D" />)
      expect(container.querySelector("svg")).toBeNull()
      const root = container.firstElementChild as HTMLElement
      expect(root.style.backgroundColor).toBe("rgb(16, 35, 61)")
    }
  })

  it("renders diamond/hexagon/cylinder as a scaling inline SVG carrying the fill color", () => {
    for (const shape of ["diamond", "hexagon", "cylinder"] as const) {
      const { container } = render(<ShapeVisual shape={shape} color="#10233D" />)
      const svg = container.querySelector("svg")
      expect(svg).not.toBeNull()
      expect(svg).toHaveAttribute("viewBox", "0 0 100 100")
      expect(svg).toHaveAttribute("preserveAspectRatio", "none")
      const filledShape = container.querySelector("[fill]")
      expect(filledShape).toHaveAttribute("fill", "#10233D")
    }
  })

  it("renders children content for both CSS and SVG shapes", () => {
    const { container: rectContainer } = render(
      <ShapeVisual shape="rectangle" color="#1F1F1F">
        <span>Label</span>
      </ShapeVisual>,
    )
    expect(within(rectContainer).getByText("Label")).toBeInTheDocument()

    const { container: diamondContainer } = render(
      <ShapeVisual shape="diamond" color="#1F1F1F">
        <span>Label</span>
      </ShapeVisual>,
    )
    expect(within(diamondContainer).getByText("Label")).toBeInTheDocument()
  })

  it("defaults to the subtle border/stroke token and switches to the brand accent when selected", () => {
    const { container: restContainer } = render(<ShapeVisual shape="rectangle" color="#1F1F1F" />)
    expect((restContainer.firstElementChild as HTMLElement).className).toContain("border-surface-border")

    const { container: selectedContainer } = render(<ShapeVisual shape="rectangle" color="#1F1F1F" selected />)
    expect((selectedContainer.firstElementChild as HTMLElement).className).toContain("border-brand")

    const { container: restSvgContainer } = render(<ShapeVisual shape="hexagon" color="#1F1F1F" />)
    expect(restSvgContainer.querySelector("polygon")).toHaveAttribute("stroke", "var(--border-default)")

    const { container: selectedSvgContainer } = render(<ShapeVisual shape="hexagon" color="#1F1F1F" selected />)
    expect(selectedSvgContainer.querySelector("polygon")).toHaveAttribute("stroke", "var(--accent-primary)")
  })
})
