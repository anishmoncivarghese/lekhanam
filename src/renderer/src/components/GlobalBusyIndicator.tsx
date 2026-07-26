
import React from 'react'
import { useUIStore } from '../store/uiStore'

export function GlobalBusyIndicator(): React.JSX.Element | null {
  const { busyTask } = useUIStore()

  if (!busyTask) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: 'white',
        cursor: 'wait'
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          border: '4px solid white',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}
      ></div>
      <p style={{ marginTop: '20px', fontSize: '1.2em' }}>{busyTask}</p>
      <style>
        {`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  )
}
