export function snapshotRooms(rooms) {
  const entries = []
  for (const [roomId, room] of rooms.entries()) {
    const usersCount = room?.users?.size ?? 0
    const strokesCount = Array.isArray(room?.strokes) ? room.strokes.length : 0
    const messagesCount = Array.isArray(room?.messages) ? room.messages.length : 0
    entries.push({ roomId, usersCount, strokesCount, messagesCount })
  }
  entries.sort((a, b) => b.usersCount - a.usersCount || a.roomId.localeCompare(b.roomId))
  return entries
}

