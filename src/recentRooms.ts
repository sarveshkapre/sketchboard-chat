import { normalizeRoomId } from './room'

const RECENT_ROOMS_KEY = 'sketchboard.recentRooms.v1'

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    return globalThis.localStorage as Storage
  }
  return null
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function readRecentRooms(limit = 6) {
  const storage = getStorage()
  if (!storage) return []
  const raw = storage.getItem(RECENT_ROOMS_KEY)
  if (!raw) return []
  const parsed = safeParseJson(raw)
  if (!Array.isArray(parsed)) return []

  const normalized = parsed
    .map((value) => (typeof value === 'string' ? normalizeRoomId(value) : null))
    .filter((value): value is string => Boolean(value))

  return Array.from(new Set(normalized)).slice(0, limit)
}

export function writeRecentRooms(rooms: string[]) {
  const storage = getStorage()
  if (!storage) return
  const normalized = rooms
    .map((value) => normalizeRoomId(value))
    .filter((value): value is string => Boolean(value))
  storage.setItem(RECENT_ROOMS_KEY, JSON.stringify(Array.from(new Set(normalized))))
}

export function addRecentRoom(roomId: string, limit = 6) {
  const normalized = normalizeRoomId(roomId)
  const existing = readRecentRooms(limit)
  const next = [normalized, ...existing.filter((value) => value !== normalized)].slice(0, limit)
  writeRecentRooms(next)
  return next
}
