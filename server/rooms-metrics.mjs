function toBasicUser(user) {
  return {
    id: user?.id ?? '',
    name: user?.name ?? 'Unknown',
    color: user?.color ?? '#4d96ff',
  }
}

export function snapshotRooms(rooms, options) {
  const includeUsers = Boolean(options?.includeUsers)
  const entries = []
  for (const [roomId, room] of rooms.entries()) {
    const usersCount = room?.users?.size ?? 0
    const strokesCount = Array.isArray(room?.strokes) ? room.strokes.length : 0
    const messagesCount = Array.isArray(room?.messages) ? room.messages.length : 0
    const entry = { roomId, usersCount, strokesCount, messagesCount }
    if (includeUsers) {
      const users = Array.from(room?.users?.values?.() ?? [], toBasicUser).filter(
        (user) => user.id,
      )
      entry.users = users.sort((a, b) => a.name.localeCompare(b.name))
    }
    entries.push(entry)
  }
  entries.sort((a, b) => b.usersCount - a.usersCount || a.roomId.localeCompare(b.roomId))
  return entries
}
