import React, { useEffect } from 'react'
import { useUIStore } from './store/uiStore'
import { useSecurityStore } from './store/securityStore'
import HomePage from './pages/HomePage'
import NewBookPage from './pages/NewBookPage'
import BookDashboard from './pages/BookDashboard'
import LockScreen from './components/LockScreen'
import { GlobalBusyIndicator } from './components/GlobalBusyIndicator'
import { WelcomeModal } from './components/WelcomeModal'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App(): React.JSX.Element {
  const { currentPage, isDark, hydrateFromMain } = useUIStore()
  const { isEnabled, isLocked } = useSecurityStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  useEffect(() => {
    hydrateFromMain()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Catch unhandled promise rejections and global JS errors outside React tree
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
      console.error('[Lekhanam] Unhandled promise rejection:', event.reason)
    }
    const handleError = (event: ErrorEvent): void => {
      console.error('[Lekhanam] Unhandled error:', event.error)
    }
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [])

  return (
    <ErrorBoundary>
      {currentPage === 'new-book' && <NewBookPage />}
      {currentPage === 'book' && <BookDashboard />}
      {currentPage === 'home' && <HomePage />}
      {isEnabled && isLocked && <LockScreen />}
      <GlobalBusyIndicator />
      <WelcomeModal />
    </ErrorBoundary>
  )
}
