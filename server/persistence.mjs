import fs from 'node:fs/promises'
import path from 'node:path'

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeMessage(value) {
  if (!value || typeof value !== 'object') return null
  const id = typeof value.id === 'string' ? value.id : ''
  const text = typeof value.text === 'string' ? value.text : ''
  const userId = typeof value.userId === 'string' ? value.userId : ''
  const userName = typeof value.userName === 'string' ? value.userName : ''
  const userColor = typeof value.userColor === 'string' ? value.userColor : ''
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : ''
  if (!id || !text || !createdAt) return null
  return { id, text, userId, userName, userColor, createdAt }
}

function normalizeImage(value) {
  if (!value || typeof value !== 'object') return null
  const id = typeof value.id === 'string' ? value.id : ''
  const dataUrl = typeof value.dataUrl === 'string' ? value.dataUrl : ''
  const x = typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : null
  const y = typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : null
  const w = typeof value.w === 'number' && Number.isFinite(value.w) ? value.w : null
  const h = typeof value.h === 'number' && Number.isFinite(value.h) ? value.h : null
  if (!id || !dataUrl || x === null || y === null || w === null || h === null) return null

  // Keep optional metadata when present.
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : ''
  const userId = typeof value.userId === 'string' ? value.userId : ''
  const userName = typeof value.userName === 'string' ? value.userName : ''
  const userColor = typeof value.userColor === 'string' ? value.userColor : ''
  const mime = typeof value.mime === 'string' ? value.mime : ''
  const bytes = typeof value.bytes === 'number' && Number.isFinite(value.bytes) ? value.bytes : null

  const image = { id, dataUrl, x, y, w, h }
  if (createdAt) image.createdAt = createdAt
  if (userId) image.userId = userId
  if (userName) image.userName = userName
  if (userColor) image.userColor = userColor
  if (mime) image.mime = mime
  if (bytes !== null) image.bytes = bytes
  return image
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function atomicWriteJson(filePath, data) {
  await atomicWriteText(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

async function atomicWriteText(filePath, text) {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, text, 'utf8')
  await fs.rename(tmpPath, filePath)
}

async function safeUnlink(filePath) {
  try {
    await fs.unlink(filePath)
  } catch {
    // best-effort cleanup
  }
}

export function createRoomPersistence(options) {
  const enabled = Boolean(options?.enabled)
  const dir = String(options?.dir || '')
  const debounceMs = Number.isFinite(options?.debounceMs) ? Math.max(50, options.debounceMs) : 400
  const limits = options?.limits || { maxStrokes: 1000, maxMessages: 200, maxAudit: 40, maxImages: 20 }
  const maxAudit = Number.isFinite(limits?.maxAudit) ? Math.max(1, limits.maxAudit) : 40
  const maxImages = Number.isFinite(limits?.maxImages) ? Math.max(0, limits.maxImages) : 20
  const maxBytes =
    Number.isFinite(options?.maxBytes) && options.maxBytes > 0
      ? Math.max(1024, Math.floor(options.maxBytes))
      : null
  const maxRooms = Number.isFinite(options?.maxRooms) ? Math.max(1, options.maxRooms) : null
  const maxAgeMs = Number.isFinite(options?.maxAgeMs) ? Math.max(1, options.maxAgeMs) : null

  const timers = new Map()
  let lastCleanupAt = 0

  function roomFile(roomId) {
    return path.join(dir, `room-${roomId}.json`)
  }

  async function cleanupNow() {
    if (!enabled) return
    if (!dir) return
    if (!maxRooms && !maxAgeMs) return

    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    const candidates = entries
      .filter((entry) => entry.isFile() && entry.name.startsWith('room-') && entry.name.endsWith('.json'))
      .map((entry) => path.join(dir, entry.name))

    if (candidates.length === 0) return

    const stats = await Promise.all(
      candidates.map(async (filePath) => {
        try {
          const stat = await fs.stat(filePath)
          return { filePath, mtimeMs: stat.mtimeMs }
        } catch {
          return null
        }
      }),
    )

    const files = stats.filter(Boolean)
    if (files.length === 0) return

    const now = Date.now()

    if (maxAgeMs) {
      await Promise.all(
        files
          .filter((file) => now - file.mtimeMs > maxAgeMs)
          .map((file) => safeUnlink(file.filePath)),
      )
    }

    if (maxRooms) {
      const sorted = files.slice().sort((a, b) => b.mtimeMs - a.mtimeMs)
      const extra = sorted.slice(maxRooms)
      await Promise.all(extra.map((file) => safeUnlink(file.filePath)))
    }
  }

  function scheduleCleanup() {
    if (!enabled) return
    if (!maxRooms && !maxAgeMs) return

    const now = Date.now()
    if (now - lastCleanupAt < 60_000) return
    lastCleanupAt = now
    void cleanupNow().catch(() => {})
  }

  async function load(roomId) {
    if (!enabled) return null
    const filePath = roomFile(roomId)
    if (!(await pathExists(filePath))) return null

    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = safeJsonParse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const locked = parsed.locked === true
    const isPrivate = parsed.private === true
    const inviteVersion = Number.isFinite(parsed.inviteVersion)
      ? Math.max(0, Math.floor(parsed.inviteVersion))
      : 0
    const strokes = asArray(parsed.strokes).slice(-limits.maxStrokes)
    const images = asArray(parsed.images).map(normalizeImage).filter(Boolean).slice(-maxImages)
    const messages = asArray(parsed.messages)
      .map(normalizeMessage)
      .filter(Boolean)
      .slice(-limits.maxMessages)
    const audit = asArray(parsed.audit)
      .filter((entry) => entry && typeof entry === 'object')
      .filter(
        (entry) =>
          typeof entry.id === 'string' &&
          typeof entry.at === 'string' &&
          typeof entry.text === 'string',
      )
      .slice(-maxAudit)
    const rolesByKey = Array.isArray(parsed.rolesByKey) ? parsed.rolesByKey : []
    const ownerKey = typeof parsed.ownerKey === 'string' ? parsed.ownerKey : null
    let pinnedId = typeof parsed.pinnedId === 'string' ? parsed.pinnedId : null
    if (pinnedId && !messages.some((message) => message.id === pinnedId)) {
      pinnedId = null
    }

    return {
      strokes,
      images,
      messages,
      audit,
      rolesByKey,
      ownerKey,
      pinnedId,
      locked,
      private: isPrivate,
      inviteVersion,
    }
  }

  function serializeSnapshot(snapshot) {
    return `${JSON.stringify(snapshot, null, 2)}\n`
  }

  function byteLengthUtf8(value) {
    return Buffer.byteLength(value, 'utf8')
  }

  function trimSnapshotToMaxBytes(snapshot) {
    if (!maxBytes) return { snapshot, serialized: serializeSnapshot(snapshot), trimmed: null }

    let serialized = serializeSnapshot(snapshot)
    if (byteLengthUtf8(serialized) <= maxBytes) {
      return { snapshot, serialized, trimmed: null }
    }

    const trimmed = { maxBytes, droppedImages: 0, droppedStrokes: 0, droppedMessages: 0, droppedAudit: 0 }

    function dropFront(field, counterKey, chunk) {
      const arr = snapshot[field]
      if (!Array.isArray(arr) || arr.length === 0) return false
      const n = Math.max(1, Math.min(arr.length, chunk))
      arr.splice(0, n)
      trimmed[counterKey] += n
      return true
    }

    // Prefer dropping the heaviest content first to keep metadata stable.
    // Use chunked drops to avoid O(n^2) stringify loops on large stroke histories.
    for (let guard = 0; guard < 200; guard += 1) {
      serialized = serializeSnapshot(snapshot)
      if (byteLengthUtf8(serialized) <= maxBytes) break

      // Images usually dominate size (base64 data URLs).
      if (dropFront('images', 'droppedImages', 1)) continue

      const strokesChunk = Array.isArray(snapshot.strokes) ? Math.max(10, Math.floor(snapshot.strokes.length / 10)) : 10
      if (dropFront('strokes', 'droppedStrokes', strokesChunk)) continue

      const messagesChunk = Array.isArray(snapshot.messages)
        ? Math.max(5, Math.floor(snapshot.messages.length / 10))
        : 5
      if (dropFront('messages', 'droppedMessages', messagesChunk)) continue

      if (dropFront('audit', 'droppedAudit', 5)) continue

      // Nothing left to drop; fall back to a minimal snapshot.
      snapshot.strokes = []
      snapshot.images = []
      snapshot.messages = []
      snapshot.audit = []
      snapshot.rolesByKey = []
      snapshot.ownerKey = null
      snapshot.pinnedId = null
      break
    }

    serialized = serializeSnapshot(snapshot)
    if (byteLengthUtf8(serialized) > maxBytes) {
      // Last resort: keep only the smallest required fields.
      const minimal = {
        version: snapshot.version,
        savedAt: snapshot.savedAt,
        locked: snapshot.locked,
        private: snapshot.private,
        inviteVersion: snapshot.inviteVersion,
      }
      snapshot = minimal
      serialized = serializeSnapshot(snapshot)
    }

    // Persist a small hint for debugging; load() ignores unknown fields.
    snapshot.truncated = trimmed
    serialized = serializeSnapshot(snapshot)
    if (byteLengthUtf8(serialized) > maxBytes) {
      delete snapshot.truncated
      serialized = serializeSnapshot(snapshot)
    }
    return { snapshot, serialized, trimmed }
  }

  async function saveNow(roomId, room) {
    if (!enabled) return
    const filePath = roomFile(roomId)
    const rolesByKey = Array.from(room?.rolesByKey?.entries?.() ?? []).filter(
      ([key, role]) => typeof key === 'string' && typeof role === 'string',
    )
    const snapshot = {
      version: 2,
      savedAt: new Date().toISOString(),
      locked: room?.locked === true,
      private: room?.private === true,
      inviteVersion: Number.isFinite(room?.inviteVersion) ? Math.max(0, Math.floor(room.inviteVersion)) : 0,
      strokes: asArray(room?.strokes).slice(-limits.maxStrokes),
      images: asArray(room?.images).map(normalizeImage).filter(Boolean).slice(-maxImages),
      messages: asArray(room?.messages)
        .map(normalizeMessage)
        .filter(Boolean)
        .slice(-limits.maxMessages),
      audit: asArray(room?.audit).slice(-maxAudit),
      rolesByKey,
      ownerKey: typeof room?.ownerKey === 'string' ? room.ownerKey : null,
      pinnedId: typeof room?.pinnedId === 'string' ? room.pinnedId : null,
    }

    const result = trimSnapshotToMaxBytes(snapshot)
    if (result.trimmed) {
      const finalBytes = byteLengthUtf8(result.serialized)
      process.stderr.write(
        `PERSIST WARNING: room "${roomId}" snapshot exceeded maxBytes=${result.trimmed.maxBytes}; ` +
          `dropped images=${result.trimmed.droppedImages} strokes=${result.trimmed.droppedStrokes} ` +
          `messages=${result.trimmed.droppedMessages} audit=${result.trimmed.droppedAudit}; ` +
          `finalBytes=${finalBytes}\n`,
      )
    }

    await atomicWriteText(filePath, result.serialized)
    scheduleCleanup()
  }

  function scheduleSave(roomId, room) {
    if (!enabled) return
    const existing = timers.get(roomId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      timers.delete(roomId)
      void saveNow(roomId, room).catch(() => {})
    }, debounceMs)

    timers.set(roomId, timer)
  }

  async function flush(roomId, room) {
    if (!enabled) return
    const existing = timers.get(roomId)
    if (existing) {
      clearTimeout(existing)
      timers.delete(roomId)
    }
    await saveNow(roomId, room)
  }

  return {
    enabled,
    dir,
    debounceMs,
    maxRooms,
    maxAgeMs,
    load,
    saveNow,
    scheduleSave,
    flush,
    cleanupNow,
  }
}
