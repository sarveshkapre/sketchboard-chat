export const DEFAULT_ROOM_ID = 'main'

export function normalizeRoomId(value: string | null | undefined) {
  const raw = (value ?? '').trim().toLowerCase()
  if (!raw) return DEFAULT_ROOM_ID

  const cleaned = raw
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 40)

  return cleaned || DEFAULT_ROOM_ID
}

export function getRoomIdFromUrl(url: string) {
  const parsed = new URL(url)

  const queryRoom = parsed.searchParams.get('room')
  if (queryRoom) return normalizeRoomId(queryRoom)

  const match = parsed.pathname.match(/^\/r\/([^/]+)\/?$/)
  if (match) return normalizeRoomId(decodeURIComponent(match[1]))

  return DEFAULT_ROOM_ID
}

export function isViewOnlyFromUrl(url: string) {
  const parsed = new URL(url)
  const mode = (parsed.searchParams.get('mode') || '').toLowerCase()
  return mode === 'view' || mode === 'readonly' || mode === 'read'
}

export function buildRoomUrl(currentUrl: string, roomId: string) {
  const parsed = new URL(currentUrl)
  const normalized = normalizeRoomId(roomId)
  parsed.searchParams.delete('room')

  if (normalized === DEFAULT_ROOM_ID) {
    parsed.pathname = '/'
  } else {
    parsed.pathname = `/r/${encodeURIComponent(normalized)}`
  }
  return parsed.toString()
}

export function buildViewUrl(currentUrl: string, roomId: string) {
  const url = new URL(buildRoomUrl(currentUrl, roomId))
  url.searchParams.set('mode', 'view')
  return url.toString()
}
