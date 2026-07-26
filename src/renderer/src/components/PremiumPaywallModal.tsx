import React, { useEffect, useState } from 'react'
import { useBillingStore } from '../store/billingStore'

const PRODUCT_ID = 'app.lekhanam.pro_export'

interface PremiumPaywallModalProps {
  onClose: () => void
  onUnlocked: () => void  // called after successful purchase/restore
}

export default function PremiumPaywallModal({ onClose, onUnlocked }: PremiumPaywallModalProps): React.JSX.Element {
  const { setPremium } = useBillingStore()
  const [price, setPrice] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const isBusy = status === 'loading'

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Fetch localised price from Apple immediately
  useEffect(() => {
    window.electron.billing.getProducts([PRODUCT_ID]).then((products) => {
      if (products && products.length > 0) {
        setPrice(products[0].formattedPrice ?? products[0].price ?? null)
      }
    }).catch(() => {/* price stays null — no worries */})
  }, [])

  const handlePurchase = async (): Promise<void> => {
    setStatus('loading')
    setErrorMsg(null)
    try {
      const res = await window.electron.billing.purchase(PRODUCT_ID)
      if (res.success) {
        setPremium(true)
        setStatus('success')
        setTimeout(() => { onUnlocked() }, 1200)
      } else {
        setErrorMsg(res.message || 'Purchase was not completed.')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  const handleRestore = async (): Promise<void> => {
    setStatus('loading')
    setErrorMsg(null)
    try {
      const res = await window.electron.billing.restore(PRODUCT_ID)
      if (res.success) {
        setPremium(true)
        setStatus('success')
        setTimeout(() => { onUnlocked() }, 1200)
      } else {
        setErrorMsg(res.message || 'No previous purchase found for this Apple ID.')
        setStatus('error')
      }
    } catch {
      setErrorMsg('Restore failed. Please try again.')
      setStatus('error')
    }
  }

  const priceLabel = price !== null ? price : '—'

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes pwIn { from { opacity:0; transform:scale(0.88) translateY(16px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes pwCheck { from { stroke-dashoffset:36 } to { stroke-dashoffset:0 } }
      `}</style>

      <div
        className="relative flex flex-col items-center text-center rounded-3xl"
        style={{
          width: 380,
          padding: '36px 32px 28px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.32)',
          animation: 'pwIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--fg-faint)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {status === 'success' ? (
          /* ── Success State ── */
          <>
            <div className="mb-5">
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
                <circle cx="28" cy="28" r="26" fill="#dcfce7" stroke="#22c55e" strokeWidth="2" />
                <path d="M17 28l9 9 13-15" stroke="#22c55e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"
                  style={{ strokeDasharray: 36, strokeDashoffset: 0, animation: 'pwCheck 0.4s 0.1s ease both' }} />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-[var(--fg)] mb-1">You're all set!</h2>
            <p className="text-sm text-[var(--fg-muted)]">Lekhanam Pro is now unlocked. Enjoy!</p>
          </>
        ) : (
          /* ── Default / Loading / Error State ── */
          <>
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, var(--accent), #b45309)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>

            <h2 className="text-xl font-bold text-[var(--fg)] mb-1 tracking-tight">Lekhanam Pro</h2>
            <p className="text-sm text-[var(--fg-muted)] leading-relaxed mb-6 max-w-[280px]">
              Export your manuscript to <strong className="text-[var(--fg)]">Word (.docx)</strong> and <strong className="text-[var(--fg)]">ePub</strong> — ready for publishing, agents, or Kindle.
            </p>

            {/* Feature list */}
            <div className="w-full rounded-2xl mb-6 text-left"
              style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)', padding: '14px 16px' }}>
              {[
                { icon: '📄', label: 'Export to Word (.docx)', sub: 'Formatted for agents & publishers' },
                { icon: '📚', label: 'Export to ePub', sub: 'Kindle, Apple Books, and more' },
                { icon: '🔒', label: 'One-time unlock, forever', sub: 'No subscription. Yours to keep.' },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="flex items-start gap-3 py-2">
                  <span className="text-base flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--fg)]">{label}</p>
                    <p className="text-[11px] text-[var(--fg-faint)]">{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Error message */}
            {errorMsg && status === 'error' && (
              <div className="w-full mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs text-left">
                {errorMsg}
              </div>
            )}

            {/* Purchase button */}
            <button
              onClick={handlePurchase}
              disabled={isBusy}
              className="w-full py-3 rounded-2xl font-bold text-white text-sm mb-3 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, var(--accent), #b45309)', boxShadow: '0 4px 14px rgba(217,119,6,0.35)' }}
            >
              {isBusy ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                    <path d="M12 3 A9 9 0 0 1 21 12" stroke="white" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Processing…
                </span>
              ) : (
                `Unlock Pro ${priceLabel !== '—' ? `· ${priceLabel}` : ''}`
              )}
            </button>

            {/* Restore */}
            <button
              onClick={handleRestore}
              disabled={isBusy}
              className="text-[11px] text-[var(--fg-faint)] hover:text-[var(--fg)] transition-colors disabled:opacity-40"
            >
              Restore Purchase
            </button>
          </>
        )}
      </div>
    </div>
  )
}
