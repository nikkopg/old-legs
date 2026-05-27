import { NextResponse } from 'next/server'
import { networkInterfaces } from 'os'

function getLanIP(): string | null {
  // Skip Docker/VM virtual interfaces by name — more robust than filtering by IP range.
  // With network_mode: host, this runs in the host's network namespace and sees
  // real physical interfaces (e.g. wlp3s0, eth0) alongside Docker bridges (docker0, br-xxx).
  const skipNames = /^(docker|br-|veth|virbr|lo)/
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    if (skipNames.test(name)) continue
    for (const iface of nets[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return null
}

export function GET() {
  // HOST_IP env var takes priority — fallback for non-host-network Docker setups
  // or explicit override. One-liner: echo "HOST_IP=$(hostname -I | awk '{print $1}')" >> .env
  const envIp = process.env.HOST_IP
  if (envIp) return NextResponse.json({ ip: envIp })

  return NextResponse.json({ ip: getLanIP() })
}
