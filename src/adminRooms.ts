export type RoomMetrics = {
  roomId: string
  usersCount: number
  strokesCount: number
  imagesCount?: number
  imagesBytes?: number
  messagesCount: number
  stateBytesEstimate?: number
  locked?: boolean
  private?: boolean
  users?: { id: string; name: string; color: string; role?: string }[]
}

export async function fetchRoomsMetrics(options?: { token?: string }) {
  const headers: Record<string, string> = {}
  if (options?.token) {
    headers.authorization = `Bearer ${options.token}`
  }

  const response = await fetch('/api/rooms', { headers })
  if (!response.ok) {
    throw new Error(`Rooms API failed: ${response.status}`)
  }
  const json = (await response.json()) as { rooms?: RoomMetrics[] }
  return Array.isArray(json.rooms) ? json.rooms : []
}

export async function kickUser(options: { roomId: string; userId: string; token: string }) {
  const response = await fetch(
    `/api/rooms/${encodeURIComponent(options.roomId)}/kick/${encodeURIComponent(
      options.userId,
    )}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${options.token}` },
    },
  )
  if (!response.ok) {
    throw new Error(`Kick failed: ${response.status}`)
  }
  return (await response.json()) as { ok?: boolean }
}

export async function setRoomLock(options: { roomId: string; locked: boolean; token: string }) {
  const endpoint = options.locked ? 'lock' : 'unlock'
  const response = await fetch(`/api/rooms/${encodeURIComponent(options.roomId)}/${endpoint}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${options.token}` },
  })
  if (!response.ok) {
    throw new Error(`Lock failed: ${response.status}`)
  }
  return (await response.json()) as { ok?: boolean; locked?: boolean }
}
