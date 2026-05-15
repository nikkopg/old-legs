import { useState, useRef, useCallback, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressStep = {
  label: string
  status: 'pending' | 'running' | 'done'
}

// SSE event shapes from the backend (TASK-185 format)
type ProgressEvent = {
  type: 'progress'
  step: string
  elapsed_ms: number
}

type CompleteEvent<T> = {
  type: 'complete'
  data: T
}

type ErrorEvent = {
  type: 'error'
  message: string
}

type StreamEvent<T> = ProgressEvent | CompleteEvent<T> | ErrorEvent

interface UseProgressStreamConfig<T> {
  url: string
  method?: 'POST' | 'GET'
  body?: Record<string, unknown>
  stepLabels: string[]
  onComplete: (data: T) => void
  onError: (message: string) => void
}

interface UseProgressStreamResult {
  steps: ProgressStep[]
  elapsedMs: number
  isStreaming: boolean
  trigger: () => void
  reset: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProgressStream<T>(
  config: UseProgressStreamConfig<T>
): UseProgressStreamResult {
  const { url, method = 'POST', body, stepLabels, onComplete, onError } = config

  const initialSteps = useCallback(
    () =>
      stepLabels.map((label) => ({ label, status: 'pending' as const })),
    // stepLabels identity is captured once at mount — callers should memoize if dynamic
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const [steps, setSteps] = useState<ProgressStep[]>(initialSteps)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isStreaming, setIsStreaming] = useState(false)

  // Stable refs so the stream reader closure always has current callbacks
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  // Refs for managing the in-flight fetch and interval
  const abortControllerRef = useRef<AbortController | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Clear the elapsed-time ticker
  const clearElapsedInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Abort any in-flight fetch and stop the timer
  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    clearElapsedInterval()
  }, [clearElapsedInterval])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopStream()
    }
  }, [stopStream])

  // ---------------------------------------------------------------------------
  // reset — public API
  // ---------------------------------------------------------------------------
  const reset = useCallback(() => {
    stopStream()
    setSteps(stepLabels.map((label) => ({ label, status: 'pending' })))
    setElapsedMs(0)
    setIsStreaming(false)
  }, [stopStream, stepLabels])

  // ---------------------------------------------------------------------------
  // trigger — public API
  // ---------------------------------------------------------------------------
  const trigger = useCallback(() => {
    // Prevent double-triggering
    if (abortControllerRef.current) return

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Reset steps and start streaming state
    setSteps(stepLabels.map((label) => ({ label, status: 'pending' })))
    setElapsedMs(0)
    setIsStreaming(true)

    // Start elapsed-time ticker (100 ms resolution)
    const startedAt = Date.now()
    intervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 100)

    // Fire off the fetch
    ;(async () => {
      try {
        const fetchOptions: RequestInit = {
          method,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          credentials: 'include',
        }
        if (method === 'POST' && body !== undefined) {
          fetchOptions.body = JSON.stringify(body)
        }

        const response = await fetch(url, fetchOptions)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        if (!response.body) {
          throw new Error('Response has no body')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        // Accumulate bytes across chunks to handle partial lines
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // SSE blocks are separated by double newlines
          const blocks = buffer.split('\n\n')
          // Last element may be an incomplete block — keep it in the buffer
          buffer = blocks.pop() ?? ''

          for (const block of blocks) {
            if (!block.trim()) continue

            // Extract the `data: ` line from the SSE block
            const dataLine = block
              .split('\n')
              .find((line) => line.startsWith('data: '))

            if (!dataLine) continue

            const jsonStr = dataLine.slice('data: '.length).trim()
            if (!jsonStr) continue

            let event: StreamEvent<T>
            try {
              event = JSON.parse(jsonStr) as StreamEvent<T>
            } catch {
              // Malformed JSON — skip this block
              continue
            }

            if (event.type === 'progress') {
              const receivedStep = event.step
              setSteps((prev) => {
                const targetIndex = prev.findIndex(
                  (s) => s.label === receivedStep
                )
                if (targetIndex === -1) return prev
                return prev.map((s, i) => {
                  if (i < targetIndex) return { ...s, status: 'done' }
                  if (i === targetIndex) return { ...s, status: 'running' }
                  return s
                })
              })
            } else if (event.type === 'complete') {
              clearElapsedInterval()
              setSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })))
              setIsStreaming(false)
              abortControllerRef.current = null
              onCompleteRef.current(event.data)
              return
            } else if (event.type === 'error') {
              clearElapsedInterval()
              setIsStreaming(false)
              abortControllerRef.current = null
              onErrorRef.current(event.message)
              return
            }
          }
        }
      } catch (err: unknown) {
        // AbortError is expected on unmount or reset — do not surface to caller
        if (err instanceof DOMException && err.name === 'AbortError') return

        clearElapsedInterval()
        setIsStreaming(false)
        abortControllerRef.current = null
        const message =
          err instanceof Error ? err.message : 'Unknown stream error'
        onErrorRef.current(message)
      }
    })()
  }, [url, method, body, stepLabels, clearElapsedInterval])

  return { steps, elapsedMs, isStreaming, trigger, reset }
}
