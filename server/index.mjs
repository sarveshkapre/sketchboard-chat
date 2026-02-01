import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'
import { Server } from 'socket.io'

import {
  parseCorsOrigin,
  sanitizeChatMessage,
  sanitizeCursor,
  sanitizeRoomId,
  sanitizeStroke,
} from './validation.mjs'
import { createFixedWindowRateLimiter } from './rate-limit.mjs'
import { createRoomPersistence } from './persistence.mjs'
import { snapshotRooms } from './rooms-metrics.mjs'
import { clearRedoStack, redoLastStroke, undoLastStroke } from './stroke-history.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: parseCorsOrigin(process.env.CORS_ORIGIN),
  },
})

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000

const rooms = new Map()

const LIMITS = {
  maxStrokePoints: 2000,
  maxMessageLength: 400,
  maxMessages: 200,
  maxStrokes: 1000,
}

const persistence = createRoomPersistence({
  enabled: process.env.PERSIST === '1' || process.env.PERSIST === 'true',
  dir: process.env.PERSIST_DIR
    ? path.resolve(process.cwd(), process.env.PERSIST_DIR)
    : path.resolve(process.cwd(), 'data'),
  debounceMs: process.env.PERSIST_DEBOUNCE_MS
    ? Number(process.env.PERSIST_DEBOUNCE_MS)
    : 400,
  maxRooms: process.env.PERSIST_MAX_ROOMS ? Number(process.env.PERSIST_MAX_ROOMS) : null,
  maxAgeMs: process.env.PERSIST_TTL_DAYS
    ? Number(process.env.PERSIST_TTL_DAYS) * 24 * 60 * 60 * 1000
    : null,
  limits: { maxStrokes: LIMITS.maxStrokes, maxMessages: LIMITS.maxMessages },
})

const CURSOR_BROADCAST_MIN_INTERVAL_MS = 33
const RATE_LIMITS = {
  chatWindowMs: 8000,
  chatMax: 8,
  strokeWindowMs: 1000,
  strokeMax: 40,
  clearWindowMs: 5000,
  clearMax: 2,
}

const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5']

function randomName() {
  const animals = ['Fox', 'Otter', 'Lynx', 'Panda', 'Hawk', 'Koala', 'Tiger']
  const adjective = ['Swift', 'Calm', 'Bold', 'Bright', 'Witty', 'Wild']
  return `${adjective[Math.floor(Math.random() * adjective.length)]} ${
    animals[Math.floor(Math.random() * animals.length)]
  }`
}

function toPublicUser(user) {
  const publicUser = { ...user }
  delete publicUser.lastCursorAt
  return publicUser
}

function createRoomState() {
  return {
    strokes: [],
    messages: [],
    users: new Map(),
    redoByUser: new Map(),
    hydrated: false,
    hydratePromise: null,
  }
}

function getRoom(roomId) {
  const existing = rooms.get(roomId)
  if (existing) return existing
  const created = createRoomState()
  if (persistence.enabled) {
    created.hydratePromise = persistence
      .load(roomId)
      .then((loaded) => {
        if (loaded) {
          created.strokes = loaded.strokes
          created.messages = loaded.messages
        }
      })
      .catch(() => {})
      .finally(() => {
        created.hydrated = true
      })
  } else {
    created.hydrated = true
  }
  rooms.set(roomId, created)
  return created
}

function snapshotUsers(room) {
  return Array.from(room.users.values(), toPublicUser)
}

function broadcastPresence(roomId, room) {
  io.to(roomId).emit('presence:update', snapshotUsers(room))
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

function getAdminToken() {
  const token = process.env.ADMIN_TOKEN
  return typeof token === 'string' && token.trim() ? token.trim() : null
}

function isAuthorizedAdmin(req) {
  const token = getAdminToken()
  if (!token) return { enabled: false, authorized: false }

  const header = req.header('authorization') || ''
  const value = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  return { enabled: true, authorized: value === token }
}

app.get('/api/rooms', (req, res) => {
  const auth = isAuthorizedAdmin(req)
  if (auth.enabled && !auth.authorized) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  res.json({ rooms: snapshotRooms(rooms, { includeUsers: auth.authorized }) })
})

app.post('/api/rooms/:roomId/kick/:userId', (req, res) => {
  const auth = isAuthorizedAdmin(req)
  if (!auth.enabled) {
    res.status(404).json({ error: 'disabled' })
    return
  }
  if (!auth.authorized) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  const roomId = sanitizeRoomId(req.params.roomId)
  const userId = String(req.params.userId || '')

  const room = rooms.get(roomId)
  if (!room) {
    res.status(404).json({ error: 'room_not_found' })
    return
  }

  if (!room.users.has(userId)) {
    res.status(404).json({ error: 'user_not_found' })
    return
  }

  const socket = io.sockets.sockets.get(userId)
  if (!socket) {
    room.users.delete(userId)
    broadcastPresence(roomId, room)
    res.json({ ok: true, alreadyDisconnected: true })
    return
  }

  if (!socket.rooms.has(roomId)) {
    res.status(409).json({ error: 'user_not_in_room' })
    return
  }

  socket.emit('notice', { kind: 'info', message: 'You were removed from the room.' })
  setTimeout(() => socket.disconnect(true), 50)
  res.json({ ok: true })
})

const distPath = path.resolve(__dirname, '../dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

io.on('connection', async (socket) => {
  const rawRoom =
    socket.handshake.auth?.room ??
    (typeof socket.handshake.query?.room === 'string' ? socket.handshake.query.room : '')
  const roomId = sanitizeRoomId(rawRoom)
  const room = getRoom(roomId)
  if (room.hydratePromise) {
    await room.hydratePromise.catch(() => {})
  }
  socket.join(roomId)

  const isViewOnly =
    socket.handshake.auth?.mode === 'view' || socket.handshake.query?.mode === 'view'

  const user = {
    id: socket.id,
    name: randomName(),
    color: colors[Math.floor(Math.random() * colors.length)],
    cursor: { x: 0, y: 0 },
    active: true,
    lastCursorAt: 0,
  }

  room.users.set(socket.id, user)

  socket.emit('init', {
    roomId,
    strokes: room.strokes,
    messages: room.messages,
    users: snapshotUsers(room),
    selfId: socket.id,
    viewOnly: isViewOnly,
  })

  broadcastPresence(roomId, room)

  const chatLimiter = createFixedWindowRateLimiter({
    windowMs: RATE_LIMITS.chatWindowMs,
    max: RATE_LIMITS.chatMax,
  })
  const strokeLimiter = createFixedWindowRateLimiter({
    windowMs: RATE_LIMITS.strokeWindowMs,
    max: RATE_LIMITS.strokeMax,
  })
  const clearLimiter = createFixedWindowRateLimiter({
    windowMs: RATE_LIMITS.clearWindowMs,
    max: RATE_LIMITS.clearMax,
  })
  const historyLimiter = createFixedWindowRateLimiter({
    windowMs: 1000,
    max: 12,
  })

  socket.on('stroke:add', (stroke) => {
    if (isViewOnly) return
    const limit = strokeLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'stroke',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }
    const sanitized = sanitizeStroke(stroke, LIMITS)
    if (!sanitized) return
    clearRedoStack(room.redoByUser, socket.id)
    const entry = {
      ...sanitized,
      userId: socket.id,
      userName: user.name,
      userColor: user.color,
    }

    room.strokes.push(entry)
    if (room.strokes.length > LIMITS.maxStrokes) {
      room.strokes.shift()
    }
    persistence.scheduleSave(roomId, room)
    socket.to(roomId).emit('stroke:add', entry)
  })

  socket.on('stroke:undo', () => {
    if (isViewOnly) return
    const limit = historyLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'stroke',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }

    const removed = undoLastStroke(room.strokes, room.redoByUser, socket.id)
    if (!removed) {
      socket.emit('notice', { kind: 'info', message: 'Nothing to undo.' })
      return
    }
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('stroke:remove', { id: removed.id })
  })

  socket.on('stroke:redo', () => {
    if (isViewOnly) return
    const limit = historyLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'stroke',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }

    const restored = redoLastStroke(room.strokes, room.redoByUser, socket.id)
    if (!restored) {
      socket.emit('notice', { kind: 'info', message: 'Nothing to redo.' })
      return
    }
    if (room.strokes.length > LIMITS.maxStrokes) {
      room.strokes.shift()
    }
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('stroke:add', restored)
  })

  socket.on('board:clear', () => {
    if (isViewOnly) return
    const limit = clearLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'clear',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }
    room.strokes = []
    room.redoByUser.clear()
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('board:clear')
  })

  socket.on('chat:message', (message) => {
    if (isViewOnly) return
    const limit = chatLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'chat',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }
    const sanitized = sanitizeChatMessage(message, LIMITS)
    if (!sanitized) return
    const entry = {
      id: sanitized.id,
      text: sanitized.text,
      userId: socket.id,
      userName: user.name,
      userColor: user.color,
      createdAt: new Date().toISOString(),
    }
    room.messages.push(entry)
    if (room.messages.length > LIMITS.maxMessages) {
      room.messages.shift()
    }
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('chat:message', entry)
  })

  socket.on('presence:cursor', (cursor) => {
    const current = room.users.get(socket.id)
    if (!current) return
    const nextCursor = sanitizeCursor(cursor)
    if (!nextCursor) return

    const now = Date.now()
    if (now - current.lastCursorAt < CURSOR_BROADCAST_MIN_INTERVAL_MS) return

    current.lastCursorAt = now
    current.cursor = nextCursor
    socket.to(roomId).emit('presence:cursor', { id: socket.id, cursor: nextCursor })
  })

  socket.on('disconnect', () => {
    room.users.delete(socket.id)
    room.redoByUser.delete(socket.id)
    broadcastPresence(roomId, room)
    if (room.users.size === 0) {
      void persistence.flush(roomId, room).catch(() => {})
      rooms.delete(roomId)
    }
  })
})

server.listen(PORT, () => {
  console.log(`Sketchboard server running on http://localhost:${PORT}`)
})
