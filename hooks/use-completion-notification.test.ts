// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useCompletionNotification } from "./use-completion-notification"

/** Every constructed `MockNotification`'s title/body, reset per test. */
let notificationInstances: { title: string; body?: string }[] = []

class MockNotification {
  static permission: NotificationPermission = "default"
  static requestPermission = vi.fn(async () => MockNotification.permission)

  constructor(title: string, options?: NotificationOptions) {
    notificationInstances.push({ title, body: options?.body })
  }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  })
}

function fireVisibilityChange() {
  document.dispatchEvent(new Event("visibilitychange"))
}

const ORIGINAL_TITLE = "Ghost AI Editor"

describe("useCompletionNotification", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    notificationInstances = []
    MockNotification.permission = "default"
    MockNotification.requestPermission.mockClear()
    vi.stubGlobal("Notification", MockNotification)
    setVisibility("visible")
    document.title = ORIGINAL_TITLE
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe("notifyCompletion", () => {
    it("is a no-op while the tab is visible, even with permission already granted", () => {
      MockNotification.permission = "granted"
      setVisibility("visible")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.notifyCompletion("Your run finished")
      })

      expect(notificationInstances).toHaveLength(0)
      expect(document.title).toBe(ORIGINAL_TITLE)
    })

    it("shows a native Notification when hidden and permission is already granted", () => {
      MockNotification.permission = "granted"
      setVisibility("hidden")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.notifyCompletion("Your run finished")
      })

      expect(notificationInstances).toHaveLength(1)
      expect(notificationInstances[0]).toEqual({ title: "Ghost AI", body: "Your run finished" })
      // The native-notification path never touches document.title.
      expect(document.title).toBe(ORIGINAL_TITLE)
    })

    it("falls back to flashing the title when hidden without granted permission", () => {
      MockNotification.permission = "default"
      setVisibility("hidden")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.notifyCompletion("Your run finished")
      })

      expect(notificationInstances).toHaveLength(0)
      expect(document.title).toBe(ORIGINAL_TITLE)

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe("✅ Ghost AI is done")

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe(ORIGINAL_TITLE)

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe("✅ Ghost AI is done")
    })

    it("falls back to flashing the title when the Notification API is unavailable", () => {
      vi.stubGlobal("Notification", undefined)
      setVisibility("hidden")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.notifyCompletion("Your run finished")
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe("✅ Ghost AI is done")
    })

    it("falls back to flashing when permission was explicitly denied", () => {
      MockNotification.permission = "denied"
      setVisibility("hidden")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.notifyCompletion("Your run finished")
      })

      expect(notificationInstances).toHaveLength(0)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe("✅ Ghost AI is done")
    })

    it("uses a caller-supplied flashText instead of the default", () => {
      MockNotification.permission = "default"
      setVisibility("hidden")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.notifyCompletion("It failed", { flashText: "⚠️ Ghost AI hit an error" })
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe("⚠️ Ghost AI hit an error")
    })

    it("restores the original title and stops flashing once the tab becomes visible again", () => {
      MockNotification.permission = "default"
      setVisibility("hidden")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.notifyCompletion("Your run finished")
      })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe("✅ Ghost AI is done")

      setVisibility("visible")
      act(() => {
        fireVisibilityChange()
      })
      expect(document.title).toBe(ORIGINAL_TITLE)

      // No further flashing after the tab regained focus.
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(document.title).toBe(ORIGINAL_TITLE)
    })

    it("clears a previous flash before starting a new one, never stacking two intervals", () => {
      MockNotification.permission = "default"
      setVisibility("hidden")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.notifyCompletion("First run finished")
      })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe("✅ Ghost AI is done")

      // A second completion arrives mid-flash, with its own flash text.
      act(() => {
        result.current.notifyCompletion("Second run failed", {
          flashText: "⚠️ Ghost AI hit an error",
        })
      })
      // Restarting the flash begins from the real original title again.
      expect(document.title).toBe(ORIGINAL_TITLE)

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe("⚠️ Ghost AI hit an error")

      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe(ORIGINAL_TITLE)
    })

    it("stops flashing and restores the title on unmount", () => {
      MockNotification.permission = "default"
      setVisibility("hidden")
      const { result, unmount } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.notifyCompletion("Your run finished")
      })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(document.title).toBe("✅ Ghost AI is done")

      unmount()

      expect(document.title).toBe(ORIGINAL_TITLE)
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(document.title).toBe(ORIGINAL_TITLE)
    })
  })

  describe("requestPermissionOnSubmit", () => {
    it("requests permission when visible and permission is still 'default'", () => {
      MockNotification.permission = "default"
      setVisibility("visible")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.requestPermissionOnSubmit()
      })

      expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1)
    })

    it("never requests permission while the tab is hidden", () => {
      MockNotification.permission = "default"
      setVisibility("hidden")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.requestPermissionOnSubmit()
      })

      expect(MockNotification.requestPermission).not.toHaveBeenCalled()
    })

    it("never re-prompts once permission has already been granted", () => {
      MockNotification.permission = "granted"
      setVisibility("visible")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.requestPermissionOnSubmit()
      })

      expect(MockNotification.requestPermission).not.toHaveBeenCalled()
    })

    it("never re-prompts once permission has already been denied", () => {
      MockNotification.permission = "denied"
      setVisibility("visible")
      const { result } = renderHook(() => useCompletionNotification())

      act(() => {
        result.current.requestPermissionOnSubmit()
      })

      expect(MockNotification.requestPermission).not.toHaveBeenCalled()
    })

    it("does nothing when the Notification API is unavailable", () => {
      vi.stubGlobal("Notification", undefined)
      setVisibility("visible")
      const { result } = renderHook(() => useCompletionNotification())

      expect(() => {
        act(() => {
          result.current.requestPermissionOnSubmit()
        })
      }).not.toThrow()
    })
  })
})
