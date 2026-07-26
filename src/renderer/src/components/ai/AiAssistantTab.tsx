import React from 'react'
import { ModelStatusCard } from './ModelStatusCard'
import { ToolsRegion } from './ToolsRegion'

export function AiAssistantTab({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex-1 flex flex-col overflow-y-auto px-3 py-3">
      <ModelStatusCard />
      <ToolsRegion>
        {children}
      </ToolsRegion>
    </div>
  )
}
