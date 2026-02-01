export type RoomMetrics = {
  roomId: string
  usersCount: number
  strokesCount: number
  messagesCount: number
  users?: { id: string; name: string; color: string }[]
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
