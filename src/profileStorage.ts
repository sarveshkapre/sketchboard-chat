const STORAGE_KEY = 'sketchboard:profile:v1'

export type LocalProfile = {
  name: string
  color: string
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

function safeTrim(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function sanitizeColor(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return ''
  return trimmed.toLowerCase()
}

export function loadLocalProfile(): LocalProfile | null {
  try {
    const storage = getStorage()
    if (!storage) return null
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const name = safeTrim(parsed.name, 24)
    const color = sanitizeColor(parsed.color)
    if (!name && !color) return null
    return { name, color }
  } catch {
    return null
  }
}

export function saveLocalProfile(profile: Partial<LocalProfile>) {
  try {
    const storage = getStorage()
    if (!storage) return
    const current = loadLocalProfile() ?? { name: '', color: '' }
    const next: LocalProfile = {
      name: safeTrim(profile.name ?? current.name, 24),
      color: sanitizeColor(profile.color ?? current.color),
    }
    if (!next.name && !next.color) {
      storage.removeItem(STORAGE_KEY)
      return
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore storage errors (private mode / quota / disabled)
  }
}
