import { useEffect, useRef } from 'react'

const SEQUENCE = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
]

/** Calls `onUnlock` when the Konami code (↑↑↓↓←→←→BA) is typed anywhere. */
export function useKonami(onUnlock: () => void): void {
  const callback = useRef(onUnlock)
  useEffect(() => {
    callback.current = onUnlock
  })

  useEffect(() => {
    let index = 0
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key === SEQUENCE[index]) {
        index++
        if (index === SEQUENCE.length) {
          index = 0
          callback.current()
        }
      } else {
        index = key === SEQUENCE[0] ? 1 : 0
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
