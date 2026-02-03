const STORAGE_KEY = 'sketchboard.userKey.v1'

function generateKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `user-${Math.random().toString(36).slice(2, 10)}`
}

export function getUserKey() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return generateKey()
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored) return stored

  const created = generateKey()
  window.localStorage.setItem(STORAGE_KEY, created)
  return created
}

