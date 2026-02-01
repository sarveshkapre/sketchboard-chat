export type RoomMetrics = {
  roomId: string
  usersCount: number
  strokesCount: number
  messagesCount: number
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

