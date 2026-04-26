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
// Types
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 5

interface FormState {
  weeklyKm: string
  daysPerWeek: string
  biggestStruggle: string
  restingHr: string
  maxHr: string
}

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
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [form, setForm] = useState<FormState>({
    weeklyKm: '',
    daysPerWeek: '',
    biggestStruggle: '',
    restingHr: '',
    maxHr: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isStepValid = (): boolean => {
    if (step === 1) return true // weeklyKm — no required validation, 0 is acceptable
    if (step === 2) return form.daysPerWeek !== ''
    if (step === 3) return true // biggestStruggle — optional-ish, allow empty
    if (step === 4) {
      return form.restingHr === '' || (Number(form.restingHr) >= 30 && Number(form.restingHr) <= 100)
    }
    if (step === 5) {
      return form.maxHr === '' || (Number(form.maxHr) >= 100 && Number(form.maxHr) <= 220)
    }
    return true
  }

  const handleNext = () => {
    if (!isStepValid()) return
    if (step === 1) setStep(2)
    else if (step === 2) setStep(3)
    else if (step === 3) setStep(4)
    else if (step === 4) setStep(5)
  }

  const handleBack = () => {
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
    else if (step === 4) setStep(3)
    else if (step === 5) setStep(4)
  }

  const handleDone = async () => {
    if (!isStepValid()) return
    setSaveError(null)
    setIsSaving(true)
    try {
      const body: OnboardingRequest = {
        weekly_km_target: Number(form.weeklyKm) || 0,
        days_available: Math.max(1, Math.min(7, Number(form.daysPerWeek) || 1)),
        biggest_struggle: form.biggestStruggle.trim(),
        resting_hr: form.restingHr !== '' ? Number(form.restingHr) : null,
        max_hr: form.maxHr !== '' ? Number(form.maxHr) : null,
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
        <span style={stepLabelStyle}>Step {step} of {TOTAL_STEPS}</span>

        {step === 1 && (
          <>
            <div style={questionStyle}>How many km do you want to run per week?</div>
            <input
              style={inputStyle}
              type="number"
              min={0}
              value={form.weeklyKm}
              onChange={(e) => setForm((f) => ({ ...f, weeklyKm: e.target.value }))}
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
              value={form.daysPerWeek}
              onChange={(e) => setForm((f) => ({ ...f, daysPerWeek: e.target.value }))}
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
              value={form.biggestStruggle}
              onChange={(e) => setForm((f) => ({ ...f, biggestStruggle: e.target.value }))}
              placeholder="e.g. staying consistent"
              autoFocus
            />
            <div style={buttonRowStyle}>
              <button style={ghostBtnStyle} onClick={handleBack} disabled={isSaving}>
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

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.6, margin: 0, color: 'rgba(20,18,16,0.7)' }}>
              Optional — but it makes HR zones more accurate.
            </p>
            <label style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6 }} htmlFor="resting-hr">
              Resting heart rate (bpm)
            </label>
            <input
              id="resting-hr"
              type="number"
              min={30}
              max={100}
              placeholder="e.g. 52"
              value={form.restingHr}
              onChange={(e) => setForm((f) => ({ ...f, restingHr: e.target.value }))}
              style={{
                fontFamily: 'Space Mono, monospace',
                fontSize: 14,
                padding: '10px 14px',
                border: '1px solid #141210',
                background: 'transparent',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box' as const,
              }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'space-between' }}>
              <button style={ghostBtnStyle} onClick={handleBack} disabled={isSaving}>
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
          </div>
        )}

        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontFamily: 'Lora, serif', fontSize: 14, lineHeight: 1.6, margin: 0, color: 'rgba(20,18,16,0.7)' }}>
              Optional — skip if you don&apos;t know it. Pak Har will estimate from your activity history.
            </p>
            <label style={{ fontFamily: 'Work Sans, sans-serif', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6 }} htmlFor="max-hr">
              Max heart rate (bpm)
            </label>
            <input
              id="max-hr"
              type="number"
              min={100}
              max={220}
              placeholder="e.g. 182"
              value={form.maxHr}
              onChange={(e) => setForm((f) => ({ ...f, maxHr: e.target.value }))}
              style={{
                fontFamily: 'Space Mono, monospace',
                fontSize: 14,
                padding: '10px 14px',
                border: '1px solid #141210',
                background: 'transparent',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box' as const,
              }}
            />
            {saveError && (
              <div
                style={{
                  fontFamily: T.body,
                  fontSize: 13,
                  color: T.accent,
                  marginTop: 4,
                }}
              >
                {saveError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 12, justifyContent: 'space-between' }}>
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
          </div>
        )}
      </div>
    </div>
  )
}
