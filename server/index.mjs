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
  sanitizeUserProfile,
} from './validation.mjs'
import { appendAuditEvent, createAuditEntry, MAX_AUDIT_EVENTS } from './audit.mjs'
import { createFixedWindowRateLimiter } from './rate-limit.mjs'
import { createRoomPersistence } from './persistence.mjs'
import { snapshotRooms } from './rooms-metrics.mjs'
import {
  ROLE_MEMBER,
  ROLE_MOD,
  ROLE_OWNER,
  assignOwner,
  canModerate,
  ensureOwner,
  getRole,
  setRole,
} from './roles.mjs'
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
  limits: {
    maxStrokes: LIMITS.maxStrokes,
    maxMessages: LIMITS.maxMessages,
    maxAudit: MAX_AUDIT_EVENTS,
  },
})

const CURSOR_BROADCAST_MIN_INTERVAL_MS = 33
const RATE_LIMITS = {
  chatWindowMs: 8000,
  chatMax: 8,
  strokeWindowMs: 1000,
  strokeMax: 40,
  clearWindowMs: 5000,
  clearMax: 2,
  profileWindowMs: 5000,
  profileMax: 3,
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
  delete publicUser.userKey
  delete publicUser.viewOnly
  return publicUser
}

function createRoomState() {
  return {
    strokes: [],
    messages: [],
    audit: [],
    users: new Map(),
    redoByUser: new Map(),
    locked: false,
    rolesByKey: new Map(),
    ownerKey: null,
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
          if (Array.isArray(loaded.audit)) {
            created.audit = loaded.audit.filter(
              (entry) => entry && typeof entry.id === 'string' && typeof entry.text === 'string',
            )
          }
          if (Array.isArray(loaded.rolesByKey)) {
            created.rolesByKey = new Map(
              loaded.rolesByKey.filter(
                ([key, role]) => typeof key === 'string' && typeof role === 'string',
              ),
            )
          }
          if (typeof loaded.ownerKey === 'string') {
            created.ownerKey = loaded.ownerKey
          }
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

function findUserByKey(room, userKey) {
  if (!room?.users || !userKey) return null
  for (const user of room.users.values()) {
    if (user?.userKey === userKey) return user
  }
  return null
}

function emitAudit(roomId, room) {
  io.to(roomId).emit('room:audit', { entries: Array.isArray(room.audit) ? room.audit : [] })
}

function addAudit(roomId, room, entry) {
  appendAuditEvent(room, entry)
  emitAudit(roomId, room)
  persistence.scheduleSave(roomId, room)
}

function recordOwnerChange(roomId, room, previousOwnerKey) {
  if (!room.ownerKey || room.ownerKey === previousOwnerKey) return
  const owner = findUserByKey(room, room.ownerKey)
  addAudit(roomId, room, createAuditEntry({ kind: 'owner', target: owner }))
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

function setRoomLock(roomId, locked) {
  const room = rooms.get(roomId)
  if (!room) return null
  room.locked = locked
  io.to(roomId).emit('room:lock', { locked })
  persistence.scheduleSave(roomId, room)
  return room
}

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

  const targetUser = room.users.get(userId)
  if (!targetUser) {
    res.status(404).json({ error: 'user_not_found' })
    return
  }

  addAudit(
    roomId,
    room,
    createAuditEntry({ kind: 'kick', actor: { name: 'Admin' }, target: targetUser }),
  )

  const socket = io.sockets.sockets.get(userId)
  if (!socket) {
    const previousOwnerKey = room.ownerKey
    room.users.delete(userId)
    ensureOwner(room)
    recordOwnerChange(roomId, room, previousOwnerKey)
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

app.post('/api/rooms/:roomId/lock', (req, res) => {
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
  const room = setRoomLock(roomId, true)
  if (!room) {
    res.status(404).json({ error: 'room_not_found' })
    return
  }
  addAudit(roomId, room, createAuditEntry({ kind: 'lock', actor: { name: 'Admin' } }))
  res.json({ ok: true, locked: true })
})

app.post('/api/rooms/:roomId/unlock', (req, res) => {
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
  const room = setRoomLock(roomId, false)
  if (!room) {
    res.status(404).json({ error: 'room_not_found' })
    return
  }
  addAudit(roomId, room, createAuditEntry({ kind: 'unlock', actor: { name: 'Admin' } }))
  res.json({ ok: true, locked: false })
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
  const rawUserKey =
    socket.handshake.auth?.userKey ??
    (typeof socket.handshake.query?.userKey === 'string' ? socket.handshake.query.userKey : '')
  const roomId = sanitizeRoomId(rawRoom)
  const room = getRoom(roomId)
  if (room.hydratePromise) {
    await room.hydratePromise.catch(() => {})
  }
  socket.join(roomId)

  const sanitizedUserKey =
    typeof rawUserKey === 'string'
      ? rawUserKey.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
      : ''
  const userKey = sanitizedUserKey || socket.id

  const isViewOnly =
    socket.handshake.auth?.mode === 'view' || socket.handshake.query?.mode === 'view'

  const user = {
    id: socket.id,
    userKey,
    name: randomName(),
    color: colors[Math.floor(Math.random() * colors.length)],
    cursor: { x: 0, y: 0 },
    active: true,
    lastCursorAt: 0,
    viewOnly: isViewOnly,
    role: ROLE_MEMBER,
  }

  room.users.set(socket.id, user)
  const previousOwnerKey = room.ownerKey
  const existingRole = isViewOnly ? ROLE_MEMBER : getRole(room, userKey)
  if (!isViewOnly && existingRole === ROLE_OWNER) {
    room.ownerKey = userKey
  }
  if (!room.ownerKey && !isViewOnly) {
    assignOwner(room, user)
  } else {
    user.role = existingRole
  }
  ensureOwner(room)
  recordOwnerChange(roomId, room, previousOwnerKey)
  persistence.scheduleSave(roomId, room)

  socket.emit('init', {
    roomId,
    strokes: room.strokes,
    messages: room.messages,
    audit: Array.isArray(room.audit) ? room.audit : [],
    users: snapshotUsers(room),
    selfId: socket.id,
    viewOnly: isViewOnly,
    locked: room.locked,
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
  const profileLimiter = createFixedWindowRateLimiter({
    windowMs: RATE_LIMITS.profileWindowMs,
    max: RATE_LIMITS.profileMax,
  })
  const historyLimiter = createFixedWindowRateLimiter({
    windowMs: 1000,
    max: 12,
  })

  socket.on('stroke:add', (stroke) => {
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
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

  socket.on('room:lock', () => {
    if (isViewOnly) return
    const role = getRole(room, userKey)
    if (!canModerate(role)) {
      socket.emit('notice', { kind: 'info', message: 'Only moderators can lock rooms.' })
      return
    }
    room.locked = true
    io.to(roomId).emit('room:lock', { locked: true })
    addAudit(roomId, room, createAuditEntry({ kind: 'lock', actor: user }))
  })

  socket.on('room:unlock', () => {
    if (isViewOnly) return
    const role = getRole(room, userKey)
    if (!canModerate(role)) {
      socket.emit('notice', { kind: 'info', message: 'Only moderators can unlock rooms.' })
      return
    }
    room.locked = false
    io.to(roomId).emit('room:lock', { locked: false })
    addAudit(roomId, room, createAuditEntry({ kind: 'unlock', actor: user }))
  })

  socket.on('room:kick', (payload) => {
    if (isViewOnly) return
    const role = getRole(room, userKey)
    if (!canModerate(role)) {
      socket.emit('notice', { kind: 'info', message: 'Only moderators can remove users.' })
      return
    }
    const targetId = payload?.userId
    if (!targetId || !room.users.has(targetId)) return
    if (targetId === socket.id) return
    const targetUser = room.users.get(targetId)
    if (!targetUser) return
    if (role === ROLE_MOD && targetUser.role !== ROLE_MEMBER) {
      socket.emit('notice', { kind: 'info', message: 'Mods can only remove members.' })
      return
    }
    if (room.ownerKey === targetUser.userKey && role !== ROLE_OWNER) {
      socket.emit('notice', { kind: 'info', message: 'Only the owner can remove owners.' })
      return
    }

    addAudit(
      roomId,
      room,
      createAuditEntry({ kind: 'kick', actor: user, target: targetUser }),
    )

    const targetSocket = io.sockets.sockets.get(targetId)
    if (!targetSocket) {
      const previousOwnerKey = room.ownerKey
      room.users.delete(targetId)
      ensureOwner(room)
      recordOwnerChange(roomId, room, previousOwnerKey)
      broadcastPresence(roomId, room)
      return
    }
    targetSocket.emit('notice', { kind: 'info', message: 'You were removed from the room.' })
    const targetKey = targetUser.userKey
    for (const [socketId, member] of room.users.entries()) {
      if (member.userKey !== targetKey) continue
      const memberSocket = io.sockets.sockets.get(socketId)
      if (memberSocket) {
        setTimeout(() => memberSocket.disconnect(true), 50)
      } else {
        room.users.delete(socketId)
      }
    }
  })

  socket.on('role:set', (payload) => {
    if (isViewOnly) return
    const role = getRole(room, userKey)
    if (role !== ROLE_OWNER) {
      socket.emit('notice', { kind: 'info', message: 'Only the owner can manage roles.' })
      return
    }
    const targetId = payload?.userId
    const nextRole = payload?.role
    if (!targetId || targetId === socket.id) return
    const targetUser = room.users.get(targetId)
    if (!targetUser) return
    if (room.ownerKey === targetUser.userKey) {
      socket.emit('notice', { kind: 'info', message: 'Owner role cannot be changed.' })
      return
    }
    if (![ROLE_MOD, ROLE_MEMBER].includes(nextRole)) return

    setRole(room, targetUser.userKey, nextRole)
    broadcastPresence(roomId, room)
    addAudit(
      roomId,
      room,
      createAuditEntry({ kind: 'role', actor: user, target: targetUser, role: nextRole }),
    )
  })
  socket.on('stroke:undo', () => {
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
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
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
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
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
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
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
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

  socket.on('profile:update', (payload) => {
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
    if (isViewOnly) return
    const limit = profileLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'profile',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }

    const sanitized = sanitizeUserProfile(payload)
    if (!sanitized) return
    if (sanitized.name) user.name = sanitized.name
    if (sanitized.color) user.color = sanitized.color
    room.users.set(socket.id, user)
    broadcastPresence(roomId, room)
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
    const previousOwnerKey = room.ownerKey
    ensureOwner(room)
    recordOwnerChange(roomId, room, previousOwnerKey)
    broadcastPresence(roomId, room)
    if (room.users.size === 0) {
      void persistence.flush(roomId, room).catch(() => {})
      rooms.delete(roomId)
      return
    }
    persistence.scheduleSave(roomId, room)
  })
})

server.listen(PORT, () => {
  console.log(`Sketchboard server running on http://localhost:${PORT}`)
})
