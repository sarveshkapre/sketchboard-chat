const STORAGE_KEY = 'sketchboard:auth-token:v1'

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

export function loadLocalAuthToken(): string | null {
  try {
    const storage = getStorage()
    if (!storage) return null
    const raw = storage.getItem(STORAGE_KEY)
    const value = safeTrim(raw, 200)
    return value || null
  } catch {
    return null
  }
}

export function saveLocalAuthToken(token: string) {
  try {
    const storage = getStorage()
    if (!storage) return
    const value = safeTrim(token, 200)
    if (!value) {
      storage.removeItem(STORAGE_KEY)
      return
    }
    storage.setItem(STORAGE_KEY, value)
  } catch {
    // ignore storage errors (private mode / quota / disabled)
  }
}

