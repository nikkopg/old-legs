'use client'

// READY
// Component: PakHarShareCard (TASK T10)
// What was built: A modal overlay that renders a 600x400 share card with Pak Har's
//   verdict headline in Abril Fatface, a ruled footer with attribution and activity meta,
//   and a print/save button using window.print() (html2canvas not yet installed).
// Edge cases to test:
//   - verdictShort > 80 chars → fontSize 32; > 50 chars → 40; ≤ 50 chars → 48
//   - distance omitted → footer right column hidden
//   - clicking the backdrop calls onClose
//   - clicking inside the card does not call onClose
//   - print window opens with correct font imports

import React, { useRef } from 'react'
import { OL, Caps } from './NewspaperChrome'

interface PakHarShareCardProps {
  verdictShort: string
  activityTitle: string
  activityDate: string
  distance?: string
  onClose: () => void
}

export function PakHarShareCard({ verdictShort, activityTitle, activityDate, distance, onClose }: PakHarShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  function handleDownload() {
    // html2canvas not yet installed — use print fallback
    if (cardRef.current) {
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(`<html><head><title>Pak Har on ${activityTitle}</title>`)
        printWindow.document.write('<style>@import url("https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Space+Mono:wght@400;700&display=swap"); body { margin: 0; }</style>')
        printWindow.document.write('</head><body>')
        printWindow.document.write(cardRef.current.outerHTML)
        printWindow.document.write('</body></html>')
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => printWindow.print(), 500)
      }
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {/* The card itself */}
        <div
          ref={cardRef}
          style={{
            width: 600, height: 400,
            background: OL.paper,
            color: OL.ink,
            padding: '48px 56px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
          }}
        >
          {/* Headline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div
              style={{
                fontFamily: OL.display,
                fontSize: verdictShort.length > 80 ? 32 : verdictShort.length > 50 ? 40 : 48,
                lineHeight: 1.1,
                letterSpacing: -0.5,
                fontWeight: 400,
              }}
            >
              {verdictShort}
            </div>
          </div>

          {/* Footer */}
          <div>
            <div style={{ borderTop: `1px solid ${OL.accent}`, marginBottom: 12 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Caps size={9} ls={2} opacity={0.75} style={{ color: OL.accent }}>
                BY PAK HAR · SENIOR COACH · OLD LEGS
              </Caps>
              {distance && (
                <Caps size={9} ls={1} opacity={0.55}>
                  {distance} · {activityDate}
                </Caps>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleDownload}
            style={{
              background: OL.ink, color: 'var(--color-ink-on-ink)',
              border: 'none', padding: '12px 28px',
              fontFamily: OL.sans, fontSize: 11, letterSpacing: 2, fontWeight: 700,
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Print / Save →
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', color: OL.paper,
              border: `1px solid ${OL.paper}`, padding: '12px 20px',
              fontFamily: OL.sans, fontSize: 11, letterSpacing: 2, fontWeight: 700,
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
