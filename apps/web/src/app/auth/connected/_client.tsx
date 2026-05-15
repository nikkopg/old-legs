'use client'

// Client island for /auth/connected. The server page reads the cookie and passes
// the subscriber number + date down. We just wire onDone to router.replace.

import { useRouter } from 'next/navigation'
import { StravaConnectedStamp } from '@/components/redesign/StravaConnectedStamp'

interface ConnectedClientProps {
  subscriberNumber: string | number
  date: string
}

export function ConnectedClient({ subscriberNumber, date }: ConnectedClientProps) {
  const router = useRouter()
  return (
    <StravaConnectedStamp
      subscriberNumber={subscriberNumber}
      date={date}
      onDone={() => router.replace('/dashboard')}
    />
  )
}
