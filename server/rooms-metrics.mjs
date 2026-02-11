function toBasicUser(user) {
  return {
    id: user?.id ?? '',
    name: user?.name ?? 'Unknown',
    color: user?.color ?? '#4d96ff',
    role: user?.role ?? 'member',
  }
}

function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0
  const match = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) return 0
  return Math.max(0, Math.floor((match[1].length * 3) / 4))
}

function estimateImageBytes(image) {
  const bytes = image?.bytes
  if (Number.isFinite(bytes) && bytes > 0) return Math.floor(bytes)
  return estimateDataUrlBytes(image?.dataUrl)
}

function estimateImagesBytes(images) {
  if (!Array.isArray(images)) return 0
  let total = 0
  for (const image of images) {
    total += estimateImageBytes(image)
  }
  return Math.max(0, Math.floor(total))
}

function estimateJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8')
  } catch {
    return 0
  }
}

export function snapshotRooms(rooms, options) {
  const includeUsers = Boolean(options?.includeUsers)
  const entries = []
  for (const [roomId, room] of rooms.entries()) {
    const usersCount = room?.users?.size ?? 0
    const strokesCount = Array.isArray(room?.strokes) ? room.strokes.length : 0
    const imagesCount = Array.isArray(room?.images) ? room.images.length : 0
    const messagesCount = Array.isArray(room?.messages) ? room.messages.length : 0
    const imagesBytes = Number.isFinite(room?.imageBytes)
      ? Math.max(0, Math.floor(room.imageBytes))
      : estimateImagesBytes(room?.images)
    const strokesBytes = estimateJsonBytes(room?.strokes)
    const messagesBytes = estimateJsonBytes(room?.messages)
    const stateBytesEstimate = Math.max(0, imagesBytes + strokesBytes + messagesBytes)
    const entry = {
      roomId,
      usersCount,
      strokesCount,
      imagesCount,
      imagesBytes,
      messagesCount,
      stateBytesEstimate,
      locked: Boolean(room?.locked),
      private: Boolean(room?.private),
    }
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
