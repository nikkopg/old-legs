'use client'

import { use } from 'react'

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  // Always use the Next.js proxy — phone only needs to reach port 3000.
  // The proxy fetches from API_URL (localhost:8000) server-side.
  const imageUrl = `/api/share-image/${token}`

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--color-frame)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
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

        {/* Card image — long-press on iOS to "Save to Photos" */}
        <img
          src={imageUrl}
          alt="Pak Har share card"
          style={{
            width: '100%',
            display: 'block',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          }}
        />

        {/* Instructions */}
        <div style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {/* Primary: long-press hint for iOS */}
          <div style={{
            fontFamily: '"Space Mono", monospace',
            fontSize: 10,
            letterSpacing: 1,
            color: 'var(--color-muted)',
            textAlign: 'center',
          }}>
            Hold image → Save to Photos → share from Instagram
          </div>

          {/* Fallback download link */}
          <a
            href={imageUrl}
            download="pakhar-run.png"
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
              textDecoration: 'none',
              display: 'block',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            Save Image
          </a>
        </div>

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
