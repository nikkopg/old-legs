'use client'

// READY FOR QA
// Component: PakHarShareCard (TASK T10 + mobile QR share)
// What was built: Modal overlay with share card + canvas-based PNG export +
//   mobile QR handoff flow. "Share to Mobile" uploads PNG to backend (POST
//   /share-image, 1h TTL), shows QR code on desktop, phone scans → /share/[token]
//   → native Web Share API → Instagram / WhatsApp etc.
// Edge cases to test:
//   - verdictShort > 80 chars → fontSize 32; > 50 chars → 40; ≤ 50 chars → 48
//   - distance omitted → stats strip hidden
//   - clicking the backdrop calls onClose
//   - clicking inside the card does not call onClose
//   - print window opens with correct font imports
//   - LAN IP detection fails → localhost URL shown, editable URL field allows manual fix
//   - share upload fails → error state shown, button re-enabled
//   - QR regenerates when user edits the URL field
//   - /share/[token] page: load error shown if token expired

import React, { useRef, useState, useEffect } from 'react'
import { OL, Caps } from './NewspaperChrome'
import { uploadShareImage } from '@/lib/api'

interface PakHarShareCardProps {
  verdictShort: string
  activityTitle: string
  activityDate: string
  distance?: string
  movingTimeSeconds?: number
  avgPaceMinPerKm?: number
  avgHr?: number | null
  elevationGainM?: number
  onClose: () => void
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function fmtPace(minPerKm: number): string {
  const total = Math.round(minPerKm * 60)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Hardcoded light-mode values — used in both the DOM card and the canvas drawing.
// Card always draws in light-mode regardless of user theme so the PNG looks
// consistent when shared.
const CARD = {
  paper:  '#f4efe4',
  ink:    '#141210',
  accent: '#8a2a12',
  hair:   'rgba(20, 18, 16, 0.30)',
} as const

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

async function drawShareCard(
  verdictShort: string,
  activityDate: string,
  stats: { label: string; value: string; unit: string }[],
): Promise<Blob> {
  const scale  = 2
  const W      = 600 * scale   // 1200
  const H      = 400 * scale   // 800
  const PX     = 56  * scale   // 112
  const PY     = 48  * scale   //  96
  const IW     = W - PX * 2    // 976

  // Load all fonts at their exact rendered sizes before drawing
  await document.fonts.ready
  const fsSizes = verdictShort.length > 80 ? [60] : verdictShort.length > 50 ? [76] : [88]
  await Promise.all([
    ...fsSizes.map(s => document.fonts.load(`400 ${s}px "Abril Fatface"`)),
    document.fonts.load('700 30px "Space Mono"'),
    document.fonts.load('400 20px "Space Mono"'),
    document.fonts.load('600 18px "Work Sans"'),
    document.fonts.load('600 16px "Work Sans"'),
  ])

  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'top'

  // Background
  ctx.fillStyle = CARD.paper
  ctx.fillRect(0, 0, W, H)

  // ── Footer (built bottom-up) ──────────────────────────────────────────────
  const footerTextH   = 18   // 9 * 2
  const ruleGap       = 24   // 12 * 2
  const footerRuleY   = H - PY - ruleGap - footerTextH
  const footerTextY   = footerRuleY + 2 + ruleGap

  // Accent rule
  ctx.strokeStyle = CARD.accent
  ctx.lineWidth   = 2
  ctx.beginPath(); ctx.moveTo(PX, footerRuleY); ctx.lineTo(W - PX, footerRuleY); ctx.stroke()

  // Attribution
  ctx.font        = `600 ${footerTextH}px "Work Sans"`
  ctx.fillStyle   = CARD.accent
  ctx.globalAlpha = 0.75
  ctx.letterSpacing = '4px'
  ctx.fillText('BY PAK HAR · SENIOR COACH · OLD LEGS', PX, footerTextY)

  // Date (right-aligned)
  ctx.fillStyle   = CARD.ink
  ctx.globalAlpha = 0.55
  ctx.letterSpacing = '2px'
  ctx.textAlign   = 'right'
  ctx.fillText(activityDate.toUpperCase(), W - PX, footerTextY)
  ctx.textAlign   = 'left'
  ctx.globalAlpha = 1
  ctx.letterSpacing = '0px'

  // ── Stats strip ───────────────────────────────────────────────────────────
  const statsMarginBottom = 40  // 20 * 2
  const statsPadTop       = 32  // 16 * 2
  const labelH            = 16  // 8  * 2
  const labelValueGap     = 6   //  3 * 2
  const valueH            = 30  // 15 * 2
  const statsH            = statsPadTop + labelH + labelValueGap + valueH
  const statsTop          = footerRuleY - statsMarginBottom - statsH

  // Top hairline
  ctx.strokeStyle = CARD.hair
  ctx.lineWidth   = 1
  ctx.beginPath(); ctx.moveTo(PX, statsTop); ctx.lineTo(W - PX, statsTop); ctx.stroke()

  if (stats.length > 0) {
    const colW = IW / stats.length
    for (let i = 0; i < stats.length; i++) {
      const s    = stats[i]
      const colX = PX + i * colW
      const padL = i === 0 ? 0 : 32   // 16 * 2

      // Vertical divider
      if (i > 0) {
        ctx.strokeStyle = CARD.hair
        ctx.lineWidth   = 1
        ctx.beginPath()
        ctx.moveTo(colX, statsTop + statsPadTop)
        ctx.lineTo(colX, statsTop + statsH)
        ctx.stroke()
      }

      const textX  = colX + padL
      const labelY = statsTop + statsPadTop
      const valueY = labelY + labelH + labelValueGap

      // Label
      ctx.font          = `600 ${labelH}px "Work Sans"`
      ctx.fillStyle     = CARD.ink
      ctx.globalAlpha   = 0.5
      ctx.letterSpacing = '4px'
      ctx.fillText(s.label, textX, labelY)

      // Value
      ctx.font          = `700 ${valueH}px "Space Mono"`
      ctx.fillStyle     = CARD.ink
      ctx.globalAlpha   = 1
      ctx.letterSpacing = '0px'
      ctx.fillText(s.value, textX, valueY)

      // Unit
      if (s.unit) {
        const vw = ctx.measureText(s.value).width
        ctx.font          = `400 20px "Space Mono"`
        ctx.globalAlpha   = 0.5
        ctx.fillText(s.unit, textX + vw + 6, valueY + 10)
        ctx.globalAlpha   = 1
      }
    }
  }

  // ── Headline (vertically centred in remaining space) ──────────────────────
  const headlineSize = (verdictShort.length > 80 ? 30 : verdictShort.length > 50 ? 38 : 44) * scale
  ctx.font          = `400 ${headlineSize}px "Abril Fatface"`
  ctx.fillStyle     = CARD.ink
  ctx.globalAlpha   = 1
  ctx.letterSpacing = '-1px'

  const headlineAreaH = statsTop - PY
  const lines      = wrapText(ctx, verdictShort, IW)
  const lineH      = headlineSize * 1.1
  const totalTextH = lines.length * lineH
  const startY     = PY + (headlineAreaH - totalTextH) / 2

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], PX, startY + i * lineH)
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  })
}

type MobileShareState = 'idle' | 'capturing' | 'ready' | 'error'

export function PakHarShareCard({ verdictShort, activityTitle, activityDate, distance, movingTimeSeconds, avgPaceMinPerKm, avgHr, elevationGainM, onClose }: PakHarShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  const [mobileShareState, setMobileShareState] = useState<MobileShareState>('idle')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [editableUrl, setEditableUrl] = useState('')
  const [mobileError, setMobileError] = useState<string | null>(null)

  // Regenerate QR whenever editableUrl changes (covers both initial set and user edits)
  useEffect(() => {
    if (!editableUrl) return
    import('qrcode').then(({ default: QRCode }) => {
      QRCode.toDataURL(editableUrl, {
        width: 200, margin: 2,
        color: { dark: '#141210', light: '#f4efe4' },
      }).then(setQrDataUrl).catch(console.error)
    })
  }, [editableUrl])

  function handleDownload() {
    // html2canvas not yet installed — use print fallback
    if (cardRef.current) {
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        const safeTitle = activityTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        printWindow.document.write(`<html><head><title>Pak Har on ${safeTitle}</title>`)
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

  async function handleMobileShare() {
    setMobileShareState('capturing')
    setMobileError(null)
    try {
      const statsForCanvas: { label: string; value: string; unit: string }[] = []
      if (distance)                       statsForCanvas.push({ label: 'DIST', value: distance,                  unit: '' })
      if (movingTimeSeconds !== undefined) statsForCanvas.push({ label: 'TIME', value: fmtTime(movingTimeSeconds), unit: '' })
      if (avgPaceMinPerKm !== undefined)   statsForCanvas.push({ label: 'PACE', value: fmtPace(avgPaceMinPerKm),  unit: '/km' })
      if (avgHr != null)                  statsForCanvas.push({ label: 'HR',   value: String(avgHr),              unit: 'bpm' })
      if (elevationGainM !== undefined)    statsForCanvas.push({ label: 'ELEV', value: `+${elevationGainM}`,      unit: 'm' })

      const blob = await drawShareCard(verdictShort, activityDate, statsForCanvas)
      const { token } = await uploadShareImage(blob)

      // When running on localhost, substitute the LAN IP so the QR is scannable
      // from a phone. /api/local-ip uses networkInterfaces() which returns the
      // real host LAN IP (works because web container uses network_mode: host).
      let shareOrigin = window.location.origin
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        try {
          const ipRes = await fetch('/api/local-ip')
          const { ip } = await (ipRes.json() as Promise<{ ip: string | null }>)
          if (ip) {
            const port = window.location.port
            shareOrigin = `http://${ip}${port ? `:${port}` : ''}`
          }
        } catch {
          // fall back to localhost — editable URL field lets user fix it manually
        }
      }

      const url = `${shareOrigin}/share/${token}`
      setShareUrl(url)
      setEditableUrl(url)  // triggers QR generation via useEffect
      setMobileShareState('ready')
    } catch {
      setMobileShareState('error')
      setMobileError('Something went wrong. Try again.')
    }
  }

  // Suppress unused-variable warning — shareUrl is kept for potential copy-to-clipboard
  void shareUrl

  return (
    <div
      className="ol-overlay-in"
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
          className="ol-paper-drop"
          style={{
            width: 600, height: 400,
            background: CARD.paper,
            color: CARD.ink,
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
                fontSize: verdictShort.length > 80 ? 30 : verdictShort.length > 50 ? 38 : 44,
                lineHeight: 1.1,
                letterSpacing: -0.5,
                fontWeight: 400,
              }}
            >
              {verdictShort}
            </div>
          </div>

          {/* Stats strip */}
          {(distance || movingTimeSeconds !== undefined || avgPaceMinPerKm !== undefined || avgHr !== undefined || elevationGainM !== undefined) && (() => {
            const stats: { label: string; value: string; unit: string }[] = []
            if (distance)                    stats.push({ label: 'DIST',     value: distance,                    unit: '' })
            if (movingTimeSeconds !== undefined) stats.push({ label: 'TIME', value: fmtTime(movingTimeSeconds),  unit: '' })
            if (avgPaceMinPerKm !== undefined)   stats.push({ label: 'PACE', value: fmtPace(avgPaceMinPerKm),    unit: '/km' })
            if (avgHr != null)                   stats.push({ label: 'HR',   value: String(avgHr),               unit: 'bpm' })
            if (elevationGainM !== undefined)    stats.push({ label: 'ELEV', value: `+${elevationGainM}`,        unit: 'm' })
            return (
              <div style={{
                display: 'flex',
                gap: 0,
                marginBottom: 20,
                paddingTop: 16,
                borderTop: `1px solid ${CARD.hair}`,
              }}>
                {stats.map((s, i) => (
                  <div key={s.label} style={{
                    flex: 1,
                    paddingLeft: i === 0 ? 0 : 16,
                    borderLeft: i === 0 ? 'none' : `1px solid ${CARD.hair}`,
                  }}>
                    <Caps size={8} ls={2} opacity={0.5} style={{ display: 'block', marginBottom: 3 }}>
                      {s.label}
                    </Caps>
                    <span style={{
                      fontFamily: OL.mono,
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: -0.3,
                      color: CARD.ink,
                    }}>
                      {s.value}
                    </span>
                    {s.unit && (
                      <span style={{ fontFamily: OL.mono, fontSize: 10, opacity: 0.5, marginLeft: 3 }}>
                        {s.unit}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Footer */}
          <div>
            <div style={{ borderTop: `1px solid ${CARD.accent}`, marginBottom: 12 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Caps size={9} ls={2} opacity={0.75} style={{ color: CARD.accent }}>
                BY PAK HAR · SENIOR COACH · OLD LEGS
              </Caps>
              <Caps size={9} ls={1} opacity={0.55}>
                {activityDate}
              </Caps>
            </div>
          </div>
        </div>

        {/* Controls */}
        {mobileShareState === 'ready' && qrDataUrl ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <img src={qrDataUrl} alt="QR code" style={{ width: 200, height: 200 }} />

            {/* Editable URL — lets user correct IP if auto-detection fails */}
            <input
              type="text"
              value={editableUrl}
              onChange={e => setEditableUrl(e.target.value)}
              style={{
                fontFamily: OL.mono,
                fontSize: 10,
                color: OL.paper,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(244,239,228,0.25)',
                padding: '6px 10px',
                width: 260,
                textAlign: 'center',
                outline: 'none',
              }}
            />
            <Caps size={8} ls={1} opacity={0.45} style={{ color: OL.paper, marginTop: -4 }}>
              Edit IP if wrong · expires in 1 hour
            </Caps>

            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button
                onClick={() => { setMobileShareState('idle'); setQrDataUrl(null); setShareUrl(null); setEditableUrl('') }}
                style={{
                  background: 'transparent', color: OL.paper,
                  border: `1px solid ${OL.paper}`, padding: '10px 20px',
                  fontFamily: OL.sans, fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent', color: OL.paper,
                  border: `1px solid ${OL.paper}`, padding: '10px 20px',
                  fontFamily: OL.sans, fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  textTransform: 'uppercase', cursor: 'pointer',
                  opacity: 0.55,
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleMobileShare}
                disabled={mobileShareState === 'capturing'}
                style={{
                  background: OL.ink, color: 'var(--color-ink-on-ink)',
                  border: 'none', padding: '12px 28px',
                  fontFamily: OL.sans, fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  textTransform: 'uppercase',
                  cursor: mobileShareState === 'capturing' ? 'wait' : 'pointer',
                  opacity: mobileShareState === 'capturing' ? 0.6 : 1,
                }}
              >
                {mobileShareState === 'capturing' ? 'Preparing...' : 'Share to Mobile →'}
              </button>
              <button
                onClick={handleDownload}
                style={{
                  background: 'transparent', color: OL.paper,
                  border: `1px solid ${OL.paper}`, padding: '12px 20px',
                  fontFamily: OL.sans, fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                Print / Save
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'transparent', color: OL.paper,
                  border: `1px solid ${OL.paper}`, padding: '12px 20px',
                  fontFamily: OL.sans, fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  textTransform: 'uppercase', cursor: 'pointer',
                  opacity: 0.55,
                }}
              >
                Close
              </button>
            </div>
            {mobileShareState === 'error' && mobileError && (
              <Caps size={9} ls={1} opacity={0.7} style={{ color: OL.paper }}>
                {mobileError}
              </Caps>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
