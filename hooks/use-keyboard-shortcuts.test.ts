// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { useKeyboardShortcuts, type KeyboardShortcutHandlers } from "./use-keyboard-shortcuts"

function makeHandlers(): KeyboardShortcutHandlers {
  return { zoomIn: vi.fn(), zoomOut: vi.fn(), undo: vi.fn(), redo: vi.fn() }
}

function fireKeyDown(init: KeyboardEventInit, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe("useKeyboardShortcuts", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("adds a keydown listener to window on mount and removes it on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener")
    const removeSpy = vi.spyOn(window, "removeEventListener")

    const { unmount } = renderHook(() => useKeyboardShortcuts(makeHandlers()))

    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function))
    const [, listener] = addSpy.mock.calls.find(([type]) => type === "keydown") ?? []

    unmount()

    expect(removeSpy).toHaveBeenCalledWith("keydown", listener)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it("calls zoomIn on '+' and '='", () => {
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "+" })
    fireKeyDown({ key: "=" })

    expect(handlers.zoomIn).toHaveBeenCalledTimes(2)
  })

  it("calls zoomOut on '-'", () => {
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "-" })

    expect(handlers.zoomOut).toHaveBeenCalledTimes(1)
  })

  it("calls undo on Cmd/Ctrl+Z", () => {
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "z", ctrlKey: true })
    fireKeyDown({ key: "z", metaKey: true })

    expect(handlers.undo).toHaveBeenCalledTimes(2)
    expect(handlers.redo).not.toHaveBeenCalled()
  })

  it("calls redo on Cmd/Ctrl+Shift+Z", () => {
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "z", ctrlKey: true, shiftKey: true })
    fireKeyDown({ key: "Z", metaKey: true, shiftKey: true })

    expect(handlers.redo).toHaveBeenCalledTimes(2)
    expect(handlers.undo).not.toHaveBeenCalled()
  })

  it("calls redo on Cmd/Ctrl+Y", () => {
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "y", ctrlKey: true })
    fireKeyDown({ key: "y", metaKey: true })

    expect(handlers.redo).toHaveBeenCalledTimes(2)
  })

  it("does not react to a plain 'z' without a modifier", () => {
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "z" })

    expect(handlers.undo).not.toHaveBeenCalled()
    expect(handlers.redo).not.toHaveBeenCalled()
  })

  it("calls preventDefault on every recognized shortcut", () => {
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    const event = fireKeyDown({ key: "+" })

    expect(event.defaultPrevented).toBe(true)
  })

  it("ignores shortcuts when the event target is an <input>", () => {
    const input = document.createElement("input")
    document.body.appendChild(input)
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "z", ctrlKey: true }, input)

    expect(handlers.undo).not.toHaveBeenCalled()
  })

  it("ignores shortcuts when the event target is a <textarea>", () => {
    const textarea = document.createElement("textarea")
    document.body.appendChild(textarea)
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "+" }, textarea)

    expect(handlers.zoomIn).not.toHaveBeenCalled()
  })

  it("ignores shortcuts when document.activeElement is contenteditable, even if the event target differs", () => {
    const editable = document.createElement("div")
    editable.setAttribute("contenteditable", "true")
    document.body.appendChild(editable)
    editable.focus()

    const outsideTarget = document.createElement("div")
    document.body.appendChild(outsideTarget)

    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "-" }, outsideTarget)

    expect(handlers.zoomOut).not.toHaveBeenCalled()
  })

  it("still fires shortcuts from a non-editable target with no editable activeElement", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)
    const handlers = makeHandlers()
    renderHook(() => useKeyboardShortcuts(handlers))

    fireKeyDown({ key: "-" }, div)

    expect(handlers.zoomOut).toHaveBeenCalledTimes(1)
  })
})
