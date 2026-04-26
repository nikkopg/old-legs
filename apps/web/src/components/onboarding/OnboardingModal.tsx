'use client'

import { useState } from 'react'
import { saveOnboarding } from '@/lib/api'
import type { OnboardingRequest } from '@/types/api'

// ---------------------------------------------------------------------------
// Design tokens (tabloid system)
// ---------------------------------------------------------------------------

const T = {
  paper: '#f4efe4',
  ink: '#141210',
  accent: '#8a2a12',
  display: '"Abril Fatface", "Playfair Display", Didot, serif',
  body: '"Lora", Georgia, serif',
  sans: '"Work Sans", "Inter", sans-serif',
  mono: '"Space Mono", "JetBrains Mono", monospace',
} as const

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OnboardingModalProps {
  onComplete: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [weeklyKm, setWeeklyKm] = useState<string>('')
  const [daysPerWeek, setDaysPerWeek] = useState<string>('')
  const [biggestStruggle, setBiggestStruggle] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleNext = () => {
    if (step === 1) setStep(2)
    else if (step === 2) setStep(3)
  }

  const handleBack = () => {
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  const handleDone = async () => {
    setSaveError(null)
    setIsSaving(true)
    try {
      const body: OnboardingRequest = {
        weekly_km_target: Number(weeklyKm) || 0,
        days_available: Math.max(1, Math.min(7, Number(daysPerWeek) || 1)),
        biggest_struggle: biggestStruggle.trim(),
      }
      await saveOnboarding(body)
      onComplete()
    } catch {
      setSaveError('Something went wrong saving your answers. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // Overlay — not dismissible (no onClick on the backdrop)
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const boxStyle: React.CSSProperties = {
    background: T.paper,
    border: `3px solid ${T.ink}`,
    padding: 32,
    width: 480,
    maxWidth: 'calc(100vw - 32px)',
  }

  const inputStyle: React.CSSProperties = {
    border: `1px solid ${T.ink}`,
    background: 'transparent',
    fontFamily: T.mono,
    fontSize: 14,
    padding: '10px 14px',
    width: '100%',
    color: T.ink,
    outline: 'none',
    borderRadius: 0,
    boxSizing: 'border-box',
  }

  const primaryBtnStyle: React.CSSProperties = {
    background: T.ink,
    color: T.paper,
    border: 'none',
    padding: '10px 24px',
    fontFamily: T.sans,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 3,
    cursor: isSaving ? 'not-allowed' : 'pointer',
    borderRadius: 0,
    opacity: isSaving ? 0.6 : 1,
  }

  const ghostBtnStyle: React.CSSProperties = {
    background: 'transparent',
    color: T.ink,
    border: `1px solid ${T.ink}`,
    padding: '10px 24px',
    fontFamily: T.sans,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 3,
    cursor: 'pointer',
    borderRadius: 0,
  }

  const stepLabelStyle: React.CSSProperties = {
    fontFamily: T.sans,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    opacity: 0.6,
    textAlign: 'right',
    display: 'block',
    marginBottom: 16,
    color: T.ink,
  }

  const questionStyle: React.CSSProperties = {
    fontFamily: T.display,
    fontSize: 32,
    fontWeight: 400,
    lineHeight: 1.1,
    color: T.ink,
    marginBottom: 20,
  }

  const buttonRowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    marginTop: 24,
    justifyContent: step === 1 ? 'flex-end' : 'space-between',
  }

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <span style={stepLabelStyle}>Step {step} of 3</span>

        {step === 1 && (
          <>
            <div style={questionStyle}>How many km do you want to run per week?</div>
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={weeklyKm}
              onChange={(e) => setWeeklyKm(e.target.value)}
              placeholder="e.g. 30"
              autoFocus
            />
            <div style={buttonRowStyle}>
              <button
                style={primaryBtnStyle}
                onClick={handleNext}
                disabled={isSaving}
              >
                Next
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={questionStyle}>How many days can you run per week?</div>
            <input
              style={inputStyle}
              type="number"
              min={1}
              max={7}
              value={daysPerWeek}
              onChange={(e) => setDaysPerWeek(e.target.value)}
              placeholder="e.g. 4"
              autoFocus
            />
            <div style={buttonRowStyle}>
              <button style={ghostBtnStyle} onClick={handleBack}>
                Back
              </button>
              <button
                style={primaryBtnStyle}
                onClick={handleNext}
                disabled={isSaving}
              >
                Next
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={questionStyle}>What&apos;s your biggest struggle with running?</div>
            <input
              style={inputStyle}
              type="text"
              value={biggestStruggle}
              onChange={(e) => setBiggestStruggle(e.target.value)}
              placeholder="e.g. staying consistent"
              autoFocus
            />
            {saveError && (
              <div
                style={{
                  fontFamily: T.body,
                  fontSize: 13,
                  color: T.accent,
                  marginTop: 12,
                }}
              >
                {saveError}
              </div>
            )}
            <div style={buttonRowStyle}>
              <button style={ghostBtnStyle} onClick={handleBack} disabled={isSaving}>
                Back
              </button>
              <button
                style={primaryBtnStyle}
                onClick={handleDone}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Done'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
