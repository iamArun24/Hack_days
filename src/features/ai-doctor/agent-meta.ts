import { Brain, Gauge, Route, ShieldCheck, Zap, type LucideIcon } from 'lucide-react'
import type { AgentKey } from './doctor-store'

export const AGENT_META: Record<AgentKey, { label: string; role: string; icon: LucideIcon; tint: string }> = {
  performance: {
    label: 'Performance',
    role: 'TTFB, critical path, heavy assets',
    icon: Gauge,
    tint: 'bg-sky/35',
  },
  reliability: { label: 'Reliability', role: 'Errors, redirects, retries', icon: Zap, tint: 'bg-peach/35' },
  security: { label: 'Security', role: 'Headers, cookies, leaks', icon: ShieldCheck, tint: 'bg-sage/35' },
  api: { label: 'API design', role: 'Chatty calls, payloads, caching', icon: Route, tint: 'bg-butter/45' },
  lead: { label: 'Lead agent', role: 'Merges findings into a fix plan', icon: Brain, tint: 'bg-lavender/40' },
}
