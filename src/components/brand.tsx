import { useId, type SVGProps } from 'react'
import { cn } from '@/lib/cn'

export const REPO_URL = 'https://github.com/0xpanadol/har-viewer'

/** Soft pastel mark: three request bars, staggered like a waterfall. Bars drift on hover. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 32 32" className={cn('group/logo size-6', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-lavender)" />
          <stop offset="0.55" stopColor="var(--color-primary)" />
          <stop offset="1" stopColor="var(--color-peach)" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx="0.3" cy="0.2" r="0.8">
          <stop offset="0" stopColor="white" stopOpacity="0.55" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-bg)`} />
      <rect width="32" height="32" rx="9" fill={`url(#${id}-shine)`} />
      <g fill="white" className="[&>rect]:transition-transform [&>rect]:duration-500 [&>rect]:ease-out">
        <rect x="7" y="9" width="10" height="3" rx="1.5" className="group-hover/logo:translate-x-1" />
        <rect
          x="11"
          y="14.5"
          width="14"
          height="3"
          rx="1.5"
          opacity=".88"
          className="group-hover/logo:-translate-x-1"
        />
        <rect
          x="9"
          y="20"
          width="8"
          height="3"
          rx="1.5"
          opacity=".66"
          className="group-hover/logo:translate-x-2"
        />
      </g>
    </svg>
  )
}

/** Brand icons are not part of lucide; inlined from GitHub's mark. */
export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  )
}
