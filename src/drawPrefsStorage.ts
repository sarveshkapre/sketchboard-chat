const STORAGE_KEY = 'sketchboard:draw-prefs:v1'

export type LocalDrawPrefs = {
  tool: 'pen' | 'eraser' | 'select'
  color: string
  size: number
}

function getStorage(): Storage | null {
  try {
    const value = (globalThis as unknown as { localStorage?: Storage }).localStorage
    if (!value) return null
    return value
  } catch {
    return null
  }
}

function sanitizeTool(value: unknown): LocalDrawPrefs['tool'] {
  if (value === 'eraser' || value === 'select') return value
  return 'pen'
}

function sanitizeColor(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return ''
  return trimmed.toLowerCase()
}

function sanitizeSize(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < 1 || rounded > 50) return null
  return rounded
}

export function loadLocalDrawPrefs(): LocalDrawPrefs | null {
  try {
    const storage = getStorage()
    if (!storage) return null
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const tool = sanitizeTool(parsed.tool)
    const color = sanitizeColor(parsed.color)
    const size = sanitizeSize(parsed.size)
    if (!color || !size) return null
    return { tool, color, size }
  } catch {
    return null
  }
}

export function saveLocalDrawPrefs(prefs: Partial<LocalDrawPrefs>) {
  try {
    const storage = getStorage()
    if (!storage) return
    const current = loadLocalDrawPrefs()
    const merged = {
      tool: sanitizeTool(prefs.tool ?? current?.tool ?? 'pen'),
      color: sanitizeColor(prefs.color ?? current?.color ?? ''),
      size: sanitizeSize(prefs.size ?? current?.size ?? null),
    }
    if (!merged.color || !merged.size) return
    storage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // ignore storage errors (private mode / quota / disabled)
  }
}
