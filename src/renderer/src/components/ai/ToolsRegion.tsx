import React from 'react'

// Pass-through wrapper. Previous versions dimmed the tools and rendered a top
// overlay when no model was loaded — that logic now lives next to the mode
// panels in AiSidePanel so the Assist/Ghostwriter/Interview tabs and the
// Assistive Writing toggle stay fully visible and interactive.
export function ToolsRegion({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <>{children}</>
}
