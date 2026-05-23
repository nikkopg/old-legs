'use client'

import { useState } from 'react'
import { saveOnboarding } from '@/lib/api'
import type { GoalEvent, OnboardingRequest } from '@/types/api'

// ---------------------------------------------------------------------------
// Design tokens (tabloid system)
// Values are CSS-var refs so the modal themes correctly in dark mode.
// ---------------------------------------------------------------------------

const T = {
  paper: 'var(--color-paper)',
  ink: 'var(--color-ink)',
  accent: 'var(--color-accent)',
  inkOnInk: 'var(--color-ink-on-ink)',
  muted: 'var(--color-muted)',
  display: '"Abril Fatface", "Playfair Display", Didot, serif',
  body: '"Lora", Georgia, serif',
  sans: '"Work Sans", "Inter", sans-serif',
  mono: '"Space Mono", "JetBrains Mono", monospace',
} as const

// ---------------------------------------------------------------------------
// Goal event options
// ---------------------------------------------------------------------------

const GOAL_OPTIONS: Array<{ value: GoalEvent; label: string; sub: string }> = [
  { value: 'general_fitness', label: 'No race',       sub: 'General fitness' },
  { value: '5k',              label: '5K',            sub: 'Speed and short distance' },
  { value: '10k',             label: '10K',           sub: 'Speed endurance' },
  { value: 'half_marathon',   label: 'Half marathon', sub: '21 km' },
  { value: 'marathon',        label: 'Marathon',      sub: '42 km' },
  { value: 'ultra',           label: 'Ultra',         sub: '50 km and beyond' },
]

// ---------------------------------------------------------------------------
// Day-of-week toggle constants
// ---------------------------------------------------------------------------

const DAYS_OF_WEEK: Array<{ value: string; label: string }> = [
  { value: 'monday',    label: 'Mon' },
  { value: 'tuesday',   label: 'Tue' },
  { value: 'wednesday', label: 'Wed' },
  { value: 'thursday',  label: 'Thu' },
  { value: 'friday',    label: 'Fri' },
  { value: 'saturday',  label: 'Sat' },
  { value: 'sunday',    label: 'Sun' },
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 6

interface FormState {
  weeklyKm: string
  availableDays: string[]
  biggestStruggle: string
  restingHr: string
  maxHr: string
  goalEvent: GoalEvent | null
  raceDate: string
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
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1)
  const [form, setForm] = useState<FormState>({
    weeklyKm: '',
    availableDays: [],
    biggestStruggle: '',
    restingHr: '',
    maxHr: '',
    goalEvent: null,
    raceDate: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isStepValid = (): boolean => {
    if (step === 1) return true // weeklyKm — no required validation, 0 is acceptable
    if (step === 2) return form.availableDays.length > 0
    if (step === 3) return true // biggestStruggle — optional-ish, allow empty
    if (step === 4) {
      return form.restingHr === '' || (Number(form.restingHr) >= 30 && Number(form.restingHr) <= 100)
    }
    if (step === 5) {
      return form.maxHr === '' || (Number(form.maxHr) >= 100 && Number(form.maxHr) <= 220)
    }
    if (step === 6) return true // goalEvent — optional
    return true
  }

  const handleNext = () => {
    if (!isStepValid()) return
    if (step === 1) setStep(2)
    else if (step === 2) setStep(3)
    else if (step === 3) setStep(4)
    else if (step === 4) setStep(5)
    else if (step === 5) setStep(6)
  }

  const handleBack = () => {
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
    else if (step === 4) setStep(3)
    else if (step === 5) setStep(4)
    else if (step === 6) setStep(5)
  }

  const handleDone = async () => {
    if (!isStepValid()) return
    setSaveError(null)
    setIsSaving(true)
    try {
      const body: OnboardingRequest = {
        weekly_km_target: Number(form.weeklyKm) || 0,
        days_available: form.availableDays.length,
        available_days: form.availableDays,
        biggest_struggle: form.biggestStruggle.trim(),
        resting_hr: form.restingHr !== '' ? Number(form.restingHr) : null,
        max_hr: form.maxHr !== '' ? Number(form.maxHr) : null,
        goal_event: form.goalEvent,
        race_date: form.raceDate || null,
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
    color: T.ink,
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
    color: T.inkOnInk,
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

  // Goal event card styles
  const goalCardStyle = (selected: boolean): React.CSSProperties => ({
    border: `${selected ? 2 : 1}px solid ${T.ink}`,
    padding: '10px 12px',
    cursor: 'pointer',
    background: selected ? T.ink : 'transparent',
    color: selected ? T.paper : T.ink,
    textAlign: 'left' as const,
    width: '100%',
    borderRadius: 0,
    outline: 'none',
  })

  return (
    <div style={overlayStyle}>
      <div style={boxStyle} className="ol-paper-drop">
        <span style={stepLabelStyle}>Step {step} of {TOTAL_STEPS}</span>

        {step === 1 && (
          <>
            <div style={questionStyle}>How many km do you comfortably run per week right now?</div>
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
            <div style={questionStyle}>Which days can you run?</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginTop: 4 }}>
              {DAYS_OF_WEEK.map(({ value, label }) => {
                const active = form.availableDays.includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        availableDays: active
                          ? f.availableDays.filter((d) => d !== value)
                          : [...f.availableDays, value],
                      }))
                    }
                    style={{
                      fontFamily: T.mono,
                      fontSize: 10,
                      textTransform: 'uppercase' as const,
                      letterSpacing: 1,
                      padding: '4px 0',
                      width: 36,
                      height: 28,
                      border: `1px solid ${T.ink}`,
                      background: active ? T.ink : 'transparent',
                      color: active ? T.paper : T.ink,
                      cursor: 'pointer',
                      borderRadius: 0,
                      outline: 'none',
                      flexShrink: 0,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div style={buttonRowStyle}>
              <button style={ghostBtnStyle} onClick={handleBack}>
                Back
              </button>
              <button
                style={{ ...primaryBtnStyle, opacity: form.availableDays.length === 0 || isSaving ? 0.4 : 1 }}
                onClick={handleNext}
                disabled={isSaving || form.availableDays.length === 0}
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
            <div style={questionStyle}>Your resting heart rate?</div>
            <p style={{ fontFamily: T.body, fontSize: 14, lineHeight: 1.6, margin: 0, color: 'var(--color-muted)' }}>
              Optional — but it makes HR zones more accurate.
            </p>
            <label style={{ fontFamily: T.sans, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6 }} htmlFor="resting-hr">
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
                fontFamily: T.mono,
                fontSize: 14,
                padding: '10px 14px',
                border: '1px solid var(--color-ink)',
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
            <div style={questionStyle}>Your max heart rate?</div>
            <p style={{ fontFamily: T.body, fontSize: 14, lineHeight: 1.6, margin: 0, color: 'var(--color-muted)' }}>
              Optional — skip if you don&apos;t know it. Pak Har will estimate from your activity history.
            </p>
            <label style={{ fontFamily: T.sans, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6 }} htmlFor="max-hr">
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
                fontFamily: T.mono,
                fontSize: 14,
                padding: '10px 14px',
                border: '1px solid var(--color-ink)',
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

        {step === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={questionStyle}>What are you training for?</div>
            <p style={{ fontFamily: T.body, fontSize: 13, lineHeight: 1.6, margin: 0, color: 'var(--color-muted)' }}>
              Optional. Pak Har will tailor his recommendations to your goal.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              {GOAL_OPTIONS.map(({ value, label, sub }) => (
                <button
                  key={value}
                  style={goalCardStyle(form.goalEvent === value)}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      goalEvent: f.goalEvent === value ? null : value,
                    }))
                  }
                  type="button"
                >
                  <div style={{
                    fontFamily: T.sans,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                    marginBottom: 2,
                  }}>
                    {label}
                  </div>
                  <div style={{
                    fontFamily: T.body,
                    fontSize: 12,
                    opacity: 0.7,
                    lineHeight: 1.3,
                  }}>
                    {sub}
                  </div>
                </button>
              ))}
            </div>
            {/* Race date */}
            <div style={{ marginTop: 12 }}>
              <label
                htmlFor="race-date"
                style={{
                  fontFamily: T.sans,
                  fontSize: 8,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 2,
                  opacity: 0.6,
                  display: 'block',
                  marginBottom: 6,
                  color: T.ink,
                }}
              >
                Race date
              </label>
              <input
                id="race-date"
                type="date"
                value={form.raceDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setForm((f) => ({ ...f, raceDate: e.target.value }))}
                style={{
                  border: `1px solid ${T.ink}`,
                  background: T.paper,
                  color: T.ink,
                  fontFamily: T.mono,
                  fontSize: 13,
                  borderRadius: 0,
                  padding: '6px 8px',
                  width: '100%',
                  boxSizing: 'border-box' as const,
                  outline: 'none',
                }}
              />
            </div>
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
