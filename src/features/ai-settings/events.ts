/** Window events that let any surface (palette, toolbar, other views) drive the AI UI. */
export const OPEN_AI_SETTINGS_EVENT = 'har:open-ai-settings'
export const FOCUS_AI_FILTER_EVENT = 'har:focus-ai-filter'

/** Opens the AI settings dialog from anywhere, including non-React code. */
export const openAiSettings = () => dispatchEvent(new Event(OPEN_AI_SETTINGS_EVENT))

/** Switches the filter toolbar into AI mode and focuses it. */
export const focusAiFilter = () => dispatchEvent(new Event(FOCUS_AI_FILTER_EVENT))

/** Splits pasted keys on newlines, commas, semicolons or spaces and drops duplicates. */
export const parseKeys = (text: string) =>
  [...new Set(text.split(/[\s,;]+/).map((k) => k.trim()))].filter(Boolean)
