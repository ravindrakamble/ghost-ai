interface AiSidebarPlaceholderProps {
  isOpen: boolean
}

/**
 * Slide-over placeholder reserving layout space for the future AI chat
 * (spec 20/25/26). No chat logic here — toggled visibility only.
 */
export function AiSidebarPlaceholder({ isOpen }: AiSidebarPlaceholderProps) {
  return (
    <aside
      aria-hidden={!isOpen}
      className={`absolute top-0 right-0 z-10 flex h-full w-80 flex-col border-l border-surface-border bg-elevated/95 backdrop-blur transition-transform duration-200 ease-in-out ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-12 shrink-0 items-center border-b border-surface-border px-4">
        <span className="text-sm font-semibold text-copy-primary">AI Assistant</span>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 text-center">
        <p className="text-sm text-copy-muted">AI chat is coming soon.</p>
      </div>
    </aside>
  )
}
