import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo })
    console.error('[Lekhanam] Unhandled error caught by boundary:', error, errorInfo)
  }

  private handleRestart = (): void => {
    window.electron.app.relaunch()
  }

  private handleSendReport = (): void => {
    const { error, errorInfo } = this.state
    const version = document.title.includes('v') ? document.title : 'unknown'

    const body = [
      'Hi Lekhanam Support,',
      '',
      'I experienced a crash in the app. Here are the details:',
      '',
      `App Version: ${version}`,
      `Platform: macOS`,
      `Date/Time: ${new Date().toLocaleString()}`,
      '',
      '--- Error ---',
      error?.message ?? 'Unknown error',
      '',
      '--- Stack Trace ---',
      error?.stack ?? 'No stack trace available',
      '',
      '--- Component Stack ---',
      errorInfo?.componentStack ?? 'Not available',
      '',
      '--- Additional Notes ---',
      '(Please describe what you were doing when the crash occurred)',
    ].join('\n')

    const subject = encodeURIComponent('[Lekhanam] App Crash Report')
    const encodedBody = encodeURIComponent(body)
    window.open(`mailto:support@lekhanam.app?subject=${subject}&body=${encodedBody}`)
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg, #faf8f5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {/* Drag region for macOS traffic lights */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 44,
            WebkitAppRegion: 'drag',
          } as React.CSSProperties}
        />

        <div
          style={{
            maxWidth: 440,
            width: '100%',
            padding: '0 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            textAlign: 'center',
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'var(--bg-subtle, #f0ece6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          {/* Heading */}
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--fg, #1c1917)' }}>
              Something went wrong
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-muted, #78716c)', lineHeight: 1.5 }}>
              Lekhanam ran into an unexpected problem and needs to restart.
              Your writing is safely saved on your Mac.
            </p>
          </div>

          {/* Error summary (collapsed, subtle) */}
          {this.state.error && (
            <div
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'var(--bg-subtle, #f0ece6)',
                border: '1px solid var(--border, #e7e2da)',
                textAlign: 'left',
              }}
            >
              <p style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: 'var(--fg-muted, #78716c)', wordBreak: 'break-word', lineHeight: 1.5 }}>
                {this.state.error.message}
              </p>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button
              onClick={this.handleSendReport}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid var(--border, #e7e2da)',
                background: 'var(--bg-card, #ffffff)',
                color: 'var(--fg-muted, #78716c)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Send Report
            </button>
            <button
              onClick={this.handleRestart}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: 10,
                border: 'none',
                background: 'var(--accent)',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Restart App
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 11, color: 'var(--fg-faint, #a8a29e)' }}>
            Your books are stored in ~/Documents/Lekhanam/ and are not affected.
          </p>
        </div>
      </div>
    )
  }
}
