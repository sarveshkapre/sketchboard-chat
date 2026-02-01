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

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
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
  const limits = options?.limits || { maxStrokes: 1000, maxMessages: 200 }
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

    const strokes = asArray(parsed.strokes).slice(-limits.maxStrokes)
    const messages = asArray(parsed.messages).slice(-limits.maxMessages)

    return { strokes, messages }
  }

  async function saveNow(roomId, room) {
    if (!enabled) return
    const filePath = roomFile(roomId)
    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      strokes: asArray(room?.strokes).slice(-limits.maxStrokes),
      messages: asArray(room?.messages).slice(-limits.maxMessages),
    }
    await atomicWriteJson(filePath, snapshot)
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
