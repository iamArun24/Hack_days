import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AiSettings, ModelRole } from './contract'

export interface AiSettingsStore extends AiSettings {
  setKeys: (keys: string[]) => void
  setConsent: (consent: boolean) => void
  setModel: (role: ModelRole, id: string | null) => void
  setAutopilot: (autopilot: boolean) => void
}

/** Accepts keys pasted one per line, comma- or space-separated; trims, dedupes, drops blanks. */
export function normalizeKeys(keys: readonly string[]): string[] {
  const split = keys.flatMap((k) => k.split(/[\s,;]+/)).map((k) => k.trim())
  return [...new Set(split.filter(Boolean))]
}

/** Lives in this browser only (localStorage), never in the build or the capture session. */
export const useAiSettings = create<AiSettingsStore>()(
  persist(
    (set) => ({
      keys: [],
      consent: false,
      models: { fast: null, smart: null },
      autopilot: true,
      setKeys: (keys) => set({ keys: normalizeKeys(keys) }),
      setConsent: (consent) => set({ consent }),
      setModel: (role, id) => set((s) => ({ models: { ...s.models, [role]: id } })),
      setAutopilot: (autopilot) => set({ autopilot }),
    }),
    {
      name: 'har-viewer:ai',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ keys: s.keys, consent: s.consent, models: s.models, autopilot: s.autopilot }),
    },
  ),
)
