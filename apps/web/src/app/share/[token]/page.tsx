'use client'

import { use, useState, useEffect } from 'react'

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  // Always use the Next.js proxy — phone only needs to reach port 3000.
  // The proxy fetches from API_URL (localhost:8000) server-side.
  const imageUrl = `/api/share-image/${token}`
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Pre-fetch the image blob on mount so navigator.share() can be called
  // synchronously on tap — iOS Safari invalidates the user gesture if any
  // await precedes navigator.share(), causing the share sheet to not open.
  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    fetch(imageUrl, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then(b => setImageBlob(b))
      .catch(err => {
        const msg = err instanceof Error ? err.message : 'network error'
        const isTimeout = err instanceof Error && err.name === 'AbortError'
        setLoadError(
          isTimeout
            ? `Request timed out. The link may have expired — generate a new one from the activity page.`
            : `Could not load image (${msg}). The link may have expired — generate a new one from the activity page.`
        )
        console.error('[share page] image fetch failed:', msg, imageUrl)
      })
      .finally(() => clearTimeout(timeout))

    return () => { controller.abort(); clearTimeout(timeout) }
  }, [imageUrl])

  function handleShare() {
    if (!navigator.share) {
      setShareError('Sharing not supported on this browser. Use Save Image instead.')
      return
    }
    if (!imageBlob) {
      setShareError('Image still loading — try again in a moment.')
      return
    }
    setSharing(true)
    setShareError(null)
    const file = new File([imageBlob], 'pakhar-run.png', { type: 'image/png' })
    navigator.share({ files: [file], title: 'Pak Har on my run' })
      .catch(err => {
        if (err instanceof Error && err.name !== 'AbortError') {
          setShareError('Could not open share sheet. Use Save Image instead.')
        }
      })
      .finally(() => setSharing(false))
  }

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

        <img
          src={imageUrl}
          alt="Pak Har share card"
          style={{ width: '100%', display: 'block', boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <button
            onClick={handleShare}
            disabled={sharing || !imageBlob || !!loadError}
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
              cursor: (sharing || !imageBlob || !!loadError) ? 'default' : 'pointer',
              opacity: (sharing || !imageBlob || !!loadError) ? 0.45 : 1,
            }}
          >
            {sharing ? 'Opening...' : !imageBlob && !loadError ? 'Loading...' : 'Share → (Instagram, WhatsApp…)'}
          </button>

          {loadError && (
            <div style={{
              fontFamily: '"Lora", Georgia, serif',
              fontSize: 13,
              color: 'var(--color-muted)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              {loadError}
            </div>
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
