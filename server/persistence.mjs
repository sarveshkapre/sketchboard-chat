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

export function createRoomPersistence(options) {
  const enabled = Boolean(options?.enabled)
  const dir = String(options?.dir || '')
  const debounceMs = Number.isFinite(options?.debounceMs) ? Math.max(50, options.debounceMs) : 400
  const limits = options?.limits || { maxStrokes: 1000, maxMessages: 200 }

  const timers = new Map()

  function roomFile(roomId) {
    return path.join(dir, `room-${roomId}.json`)
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

  return { enabled, dir, debounceMs, load, saveNow, scheduleSave, flush }
}
