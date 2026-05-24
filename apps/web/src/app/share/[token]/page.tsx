'use client'

import { use, useState } from 'react'

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const imageUrl = `/api/share-image/${token}`
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  async function handleShare() {
    setSharing(true)
    setShareError(null)
    try {
      const res = await fetch(imageUrl)
      if (!res.ok) throw new Error('Image not found or expired')
      const blob = await res.blob()
      const file = new File([blob], 'pakhar-run.png', { type: 'image/png' })
      await navigator.share({ files: [file], title: 'Pak Har on my run' })
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setShareError('Could not open share sheet. Use Save Image instead.')
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    // Dark frame wrapper — matches all other pages
    <div style={{
      minHeight: '100dvh',
      background: 'var(--color-frame)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      {/* Paper card */}
      <div style={{
        background: 'var(--color-paper)',
        width: '100%',
        maxWidth: 640,
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}>
        {/* Header */}
        <div style={{
          fontFamily: '"Space Mono", monospace',
          fontSize: 9,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
          alignSelf: 'flex-start',
        }}>
          PAK HAR · OLD LEGS
        </div>

        {/* Card image */}
        <img
          src={imageUrl}
          alt="Pak Har share card"
          style={{
            width: '100%',
            display: 'block',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          }}
        />

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          {canShare && (
            <button
              onClick={handleShare}
              disabled={sharing}
              style={{
                width: '100%',
                background: 'var(--color-ink)',
                color: 'var(--color-ink-on-ink)',
                border: 'none',
                padding: '16px 24px',
                fontFamily: '"Work Sans", "Inter", sans-serif',
                fontSize: 12,
                letterSpacing: 2,
                fontWeight: 700,
                textTransform: 'uppercase',
                cursor: sharing ? 'wait' : 'pointer',
                opacity: sharing ? 0.6 : 1,
              }}
            >
              {sharing ? 'Opening...' : 'Share → (Instagram, WhatsApp…)'}
            </button>
          )}
          <a
            href={imageUrl}
            download="pakhar-run.png"
            style={{
              width: '100%',
              background: 'var(--color-paper)',
              color: 'var(--color-ink)',
              border: '2px solid var(--color-ink)',
              padding: '16px 24px',
              fontFamily: '"Work Sans", "Inter", sans-serif',
              fontSize: 12,
              letterSpacing: 2,
              fontWeight: 700,
              textTransform: 'uppercase',
              textDecoration: 'none',
              display: 'block',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            Save Image
          </a>
        </div>

        {shareError && (
          <div style={{
            fontFamily: '"Lora", Georgia, serif',
            fontSize: 13,
            color: 'var(--color-muted)',
            textAlign: 'center',
          }}>
            {shareError}
          </div>
        )}

        {/* Footer */}
        <div style={{
          borderTop: '1px solid var(--color-hairline)',
          paddingTop: 12,
          width: '100%',
          fontFamily: '"Space Mono", monospace',
          fontSize: 9,
          letterSpacing: 1,
          color: 'var(--color-muted)',
          textAlign: 'center',
        }}>
          Link expires in 1 hour
        </div>
      </div>
    </div>
  )
}
