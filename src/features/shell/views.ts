import {
  ChartGantt,
  ChartNoAxesColumn,
  GitCompareArrows,
  List,
  ListTree,
  Orbit,
  Route,
  ShieldCheck,
  Rows3,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ViewId } from '@/store/ui-slice'

export interface ViewDefinition {
  id: ViewId
  label: string
  icon: LucideIcon
  /** Views driven by the filter sidebar + search toolbar. */
  filtered: boolean
  description: string
}

export const VIEWS: readonly ViewDefinition[] = [
  {
    id: 'requests',
    label: 'Requests',
    icon: List,
    filtered: true,
    description: 'Every request in a searchable table',
  },
  {
    id: 'waterfall',
    label: 'Waterfall',
    icon: ChartGantt,
    filtered: true,
    description: 'Timing phases for each request',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: Rows3,
    filtered: true,
    description: 'Concurrency per domain over time',
  },
  {
    id: 'galaxy',
    label: 'Galaxy',
    icon: Orbit,
    filtered: true,
    description: 'A 3D map of domains and requests',
  },
  {
    id: 'overview',
    label: 'Overview',
    icon: ChartNoAxesColumn,
    filtered: false,
    description: 'Totals, breakdowns and performance',
  },
  {
    id: 'endpoints',
    label: 'Endpoints',
    icon: Route,
    filtered: true,
    description: 'API calls grouped by route, with latency percentiles',
  },
  {
    id: 'security',
    label: 'Security',
    icon: ShieldCheck,
    filtered: false,
    description: 'Headers, cookies and leaks, graded A to F',
  },
  {
    id: 'issues',
    label: 'Issues',
    icon: TriangleAlert,
    filtered: false,
    description: 'Automated checks for common problems',
  },
  {
    id: 'initiators',
    label: 'Initiators',
    icon: ListTree,
    filtered: false,
    description: 'Which request triggered which',
  },
  {
    id: 'compare',
    label: 'Compare',
    icon: GitCompareArrows,
    filtered: false,
    description: 'Diff against another capture',
  },
]

export const viewById = (id: ViewId) => VIEWS.find((v) => v.id === id) ?? VIEWS[0]!
