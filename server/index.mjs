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
  sanitizeBoardImage,
  sanitizeBoardImageUpdate,
  sanitizeMessageId,
  sanitizeReaction,
  sanitizeRoomId,
  sanitizeStroke,
  sanitizeUserProfile,
} from './validation.mjs'
import { checkCorsOriginSafety } from './config.mjs'
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
import { createInviteToken, verifyInviteToken } from './invite.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = http.createServer(app)

const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN)
{
  const result = checkCorsOriginSafety({
    nodeEnv: process.env.NODE_ENV,
    corsOrigin,
    allowInsecureCors: process.env.ALLOW_INSECURE_CORS,
  })
  if (!result.ok) {
    throw new Error(result.error || 'Unsafe CORS configuration')
  }
  if (result.warning) {
    process.stderr.write(`${result.warning}\n`)
  }
}

function getCspHeaderValue() {
  const custom = process.env.CSP_HEADER
  if (typeof custom === 'string' && custom.trim()) return custom.trim()
  if (process.env.NODE_ENV !== 'production') return null
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self' ws: wss:",
  ].join('; ')
}

const cspHeaderValue = getCspHeaderValue()
if (cspHeaderValue) {
  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', cspHeaderValue)
    next()
  })
}

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
  },
})

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000

const rooms = new Map()

function parseMsEnv(name, fallbackMs, options) {
  const raw = process.env[name]
  if (typeof raw !== 'string' || !raw.trim()) return fallbackMs
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallbackMs
  const min = Number.isFinite(options?.min) ? options.min : null
  const max = Number.isFinite(options?.max) ? options.max : null
  let next = Math.floor(parsed)
  if (min !== null) next = Math.max(min, next)
  if (max !== null) next = Math.min(max, next)
  return next
}

function parseBytesEnv(name, fallbackBytes, options) {
  const raw = process.env[name]
  if (typeof raw !== 'string' || !raw.trim()) return fallbackBytes
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallbackBytes
  const min = Number.isFinite(options?.min) ? options.min : null
  const max = Number.isFinite(options?.max) ? options.max : null
  let next = Math.floor(parsed)
  if (min !== null) next = Math.max(min, next)
  if (max !== null) next = Math.min(max, next)
  return next
}

const ROOM_IDLE_TTL_MS = parseMsEnv('ROOM_IDLE_TTL_MS', 15 * 60 * 1000, { min: 0, max: 24 * 60 * 60 * 1000 })
const ROOM_GC_INTERVAL_MS = parseMsEnv('ROOM_GC_INTERVAL_MS', 30_000, { min: 1000, max: 5 * 60 * 1000 })
const ROOM_MAX_IMAGE_BYTES = parseBytesEnv('ROOM_MAX_IMAGE_BYTES', 8_000_000, {
  min: 1_000,
  max: 200_000_000,
})

const LIMITS = {
  maxStrokePoints: 2000,
  maxMessageLength: 400,
  maxMessages: 200,
  maxStrokes: 1000,
  maxImages: 20,
  maxImageBytes: 1_000_000,
  maxRoomImageBytes: ROOM_MAX_IMAGE_BYTES,
  allowedImageMime: ['image/png', 'image/jpeg', 'image/webp'],
}

const persistence = createRoomPersistence({
  enabled: process.env.PERSIST === '1' || process.env.PERSIST === 'true',
  dir: process.env.PERSIST_DIR
    ? path.resolve(process.cwd(), process.env.PERSIST_DIR)
    : path.resolve(process.cwd(), 'data'),
  debounceMs: process.env.PERSIST_DEBOUNCE_MS
    ? Number(process.env.PERSIST_DEBOUNCE_MS)
    : 400,
  maxBytes: process.env.PERSIST_MAX_BYTES
    ? Number(process.env.PERSIST_MAX_BYTES)
    : 10_000_000,
  maxRooms: process.env.PERSIST_MAX_ROOMS ? Number(process.env.PERSIST_MAX_ROOMS) : null,
  maxAgeMs: process.env.PERSIST_TTL_DAYS
    ? Number(process.env.PERSIST_TTL_DAYS) * 24 * 60 * 60 * 1000
    : null,
  limits: {
    maxStrokes: LIMITS.maxStrokes,
    maxMessages: LIMITS.maxMessages,
    maxAudit: MAX_AUDIT_EVENTS,
    maxImages: LIMITS.maxImages,
  },
})

const RETAIN_EMPTY_ROOMS = !persistence.enabled && ROOM_IDLE_TTL_MS > 0

function sweepIdleRooms() {
  if (!RETAIN_EMPTY_ROOMS) return
  const now = Date.now()
  for (const [roomId, room] of rooms.entries()) {
    if (!room) continue
    if (room?.users?.size > 0) continue
    const emptySinceMs =
      typeof room.emptySinceMs === 'number' && Number.isFinite(room.emptySinceMs)
        ? room.emptySinceMs
        : null
    if (emptySinceMs === null) continue
    if (now - emptySinceMs < ROOM_IDLE_TTL_MS) continue
    rooms.delete(roomId)
  }
}

if (RETAIN_EMPTY_ROOMS) {
  const timer = setInterval(() => {
    try {
      sweepIdleRooms()
    } catch {
      // best-effort; never crash the server from GC.
    }
  }, ROOM_GC_INTERVAL_MS)
  timer.unref?.()
}

const CURSOR_BROADCAST_MIN_INTERVAL_MS = 33
const RATE_LIMITS = {
  chatWindowMs: 8000,
  chatMax: 8,
  reactionWindowMs: 4000,
  reactionMax: 12,
  strokeWindowMs: 1000,
  strokeMax: 40,
  clearWindowMs: 5000,
  clearMax: 2,
  profileWindowMs: 5000,
  profileMax: 3,
  imageWindowMs: 12_000,
  imageMax: 4,
}

const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5']
const REACTIONS = ['👍', '❤️', '😂', '🎉', '👀']

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

function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0
  const match = dataUrl.match(/^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) return 0
  return Math.max(0, Math.floor((match[1].length * 3) / 4))
}

function getImageBytes(image) {
  const raw = image?.bytes
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw)
  return estimateDataUrlBytes(image?.dataUrl)
}

function estimateRoomImageBytes(images) {
  if (!Array.isArray(images)) return 0
  let total = 0
  for (const image of images) {
    total += getImageBytes(image)
  }
  return Math.max(0, total)
}

function normalizeRoomImages(images) {
  const list = Array.isArray(images) ? images : []
  const maxImages = Math.max(1, LIMITS.maxImages)
  const next = []
  for (const image of list.slice(-maxImages)) {
    const bytes = getImageBytes(image)
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > LIMITS.maxImageBytes) continue
    next.push({ ...image, bytes })
  }
  let totalBytes = estimateRoomImageBytes(next)

  while (next.length > 0 && totalBytes > LIMITS.maxRoomImageBytes) {
    const removed = next.shift()
    totalBytes -= getImageBytes(removed)
  }

  return { images: next, totalBytes: Math.max(0, totalBytes) }
}

function createRoomState() {
  return {
    strokes: [],
    images: [],
    imageBytes: 0,
    messages: [],
    audit: [],
    pinnedId: null,
    users: new Map(),
    redoByUser: new Map(),
    locked: false,
    private: false,
    inviteVersion: 0,
    rolesByKey: new Map(),
    ownerKey: null,
    hydrated: false,
    hydratePromise: null,
    emptySinceMs: null,
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
          if (Array.isArray(loaded.images)) {
            const normalized = normalizeRoomImages(loaded.images)
            created.images = normalized.images
            created.imageBytes = normalized.totalBytes
          }
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
          if (typeof loaded.pinnedId === 'string') {
            created.pinnedId = loaded.pinnedId
          }
          if (typeof loaded.locked === 'boolean') {
            created.locked = loaded.locked
          }
          if (typeof loaded.private === 'boolean') {
            created.private = loaded.private
          }
          if (Number.isFinite(loaded.inviteVersion)) {
            created.inviteVersion = Math.max(0, Math.floor(loaded.inviteVersion))
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

function getAuthToken() {
  const token = process.env.AUTH_TOKEN
  return typeof token === 'string' && token.trim() ? token.trim() : null
}

function isAuthorizedAdmin(req) {
  const token = getAdminToken()
  if (!token) return { enabled: false, authorized: false }

  const header = req.header('authorization') || ''
  const value = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  return { enabled: true, authorized: value === token }
}

function getInviteSecret() {
  const secret = process.env.INVITE_SECRET
  return typeof secret === 'string' && secret.trim() ? secret.trim() : null
}

function sanitizeInviteToken(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length > 1024) return ''
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) return ''
  return trimmed
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
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

io.on('connection', async (socket) => {
  const requiredAuthToken = getAuthToken()
  const rawAuthToken = [
    typeof socket.handshake.auth?.authToken === 'string' ? socket.handshake.auth.authToken : null,
    typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : null,
    typeof socket.handshake.query?.authToken === 'string' ? socket.handshake.query.authToken : null,
    typeof socket.handshake.query?.token === 'string' ? socket.handshake.query.token : null,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim())
  if (requiredAuthToken) {
    const provided = typeof rawAuthToken === 'string' ? rawAuthToken.trim() : ''
    if (!provided) {
      socket.emit('notice', { kind: 'info', message: 'Access token required for this server.' })
      setTimeout(() => socket.disconnect(true), 30)
      return
    }
    if (provided !== requiredAuthToken) {
      socket.emit('notice', { kind: 'info', message: 'Invalid access token.' })
      setTimeout(() => socket.disconnect(true), 30)
      return
    }
  }

  const rawRoom =
    socket.handshake.auth?.room ??
    (typeof socket.handshake.query?.room === 'string' ? socket.handshake.query.room : '')
  const rawUserKey =
    socket.handshake.auth?.userKey ??
    (typeof socket.handshake.query?.userKey === 'string' ? socket.handshake.query.userKey : '')
  const rawInvite =
    socket.handshake.auth?.invite ??
    (typeof socket.handshake.query?.invite === 'string' ? socket.handshake.query.invite : '')
  const roomId = sanitizeRoomId(rawRoom)
  const sanitizedUserKey =
    typeof rawUserKey === 'string'
      ? rawUserKey.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
      : ''
  const userKey = sanitizedUserKey || socket.id

  const isViewOnly =
    socket.handshake.auth?.mode === 'view' || socket.handshake.query?.mode === 'view'

  const room = getRoom(roomId)
  room.emptySinceMs = null
  if (room.hydratePromise) {
    await room.hydratePromise.catch(() => {})
  }

  const inviteToken = sanitizeInviteToken(rawInvite)
  if (room.private) {
    const role = getRole(room, userKey)
    const canBypassInvite = role === ROLE_OWNER || role === ROLE_MOD
    if (!canBypassInvite) {
      const secret = getInviteSecret()
      const verified = verifyInviteToken({ token: inviteToken, roomId, secret, version: room.inviteVersion })
      if (!verified.ok) {
        socket.emit('notice', { kind: 'info', message: 'Invite link required for this room.' })
        setTimeout(() => socket.disconnect(true), 30)
        return
      }
    }
  }

  socket.join(roomId)

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
    images: Array.isArray(room.images) ? room.images : [],
    messages: room.messages,
    audit: Array.isArray(room.audit) ? room.audit : [],
    pinnedId: room.pinnedId ?? null,
    users: snapshotUsers(room),
    selfId: socket.id,
    viewOnly: isViewOnly,
    locked: room.locked,
    private: room.private,
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
  const reactionLimiter = createFixedWindowRateLimiter({
    windowMs: RATE_LIMITS.reactionWindowMs,
    max: RATE_LIMITS.reactionMax,
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
  const imageLimiter = createFixedWindowRateLimiter({
    windowMs: RATE_LIMITS.imageWindowMs,
    max: RATE_LIMITS.imageMax,
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

  socket.on('image:add', (payload) => {
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
    if (isViewOnly) return
    const limit = imageLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'image',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }
    if (!Array.isArray(room.images)) room.images = []
    if (!Number.isFinite(room.imageBytes)) {
      room.imageBytes = estimateRoomImageBytes(room.images)
    }
    if (room.images.length >= LIMITS.maxImages) {
      socket.emit('notice', { kind: 'info', message: 'Too many images in this room.' })
      return
    }

    const sanitized = sanitizeBoardImage(payload, LIMITS)
    if (!sanitized) {
      socket.emit('notice', { kind: 'info', message: 'Invalid image.' })
      return
    }
    const nextImageBytes = Math.max(0, Math.floor(room.imageBytes + sanitized.bytes))
    if (nextImageBytes > LIMITS.maxRoomImageBytes) {
      socket.emit('notice', {
        kind: 'info',
        message: 'Room image storage limit reached. Remove an image before adding another.',
      })
      return
    }
    const entry = {
      ...sanitized,
      userId: socket.id,
      userName: user.name,
      userColor: user.color,
      createdAt: new Date().toISOString(),
    }
    room.images.push(entry)
    room.imageBytes = nextImageBytes
    if (room.images.length > LIMITS.maxImages) {
      const removed = room.images.shift()
      room.imageBytes = Math.max(0, room.imageBytes - getImageBytes(removed))
    }
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('image:add', entry)
  })

  socket.on('image:update', (payload) => {
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
    if (isViewOnly) return
    const limit = imageLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'image',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }
    const sanitized = sanitizeBoardImageUpdate(payload)
    if (!sanitized) return
    const index = Array.isArray(room.images)
      ? room.images.findIndex((img) => img?.id === sanitized.id)
      : -1
    if (index < 0) return
    const current = room.images[index]
    if (!current) return
    room.images[index] = { ...current, x: sanitized.x, y: sanitized.y, w: sanitized.w, h: sanitized.h }
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('image:update', sanitized)
  })

  socket.on('image:remove', (payload) => {
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
    if (isViewOnly) return
    const limit = imageLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'image',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }
    const id = typeof payload?.id === 'string' ? payload.id.trim().slice(0, 80) : ''
    if (!id) return
    if (!Array.isArray(room.images)) return
    let removed = false
    const next = []
    for (const image of room.images) {
      if (image?.id === id) {
        removed = true
        continue
      }
      next.push(image)
    }
    if (!removed) return
    room.images = next
    room.imageBytes = estimateRoomImageBytes(next)
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('image:remove', { id })
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

  socket.on('room:privacy', (payload) => {
    if (isViewOnly) return
    const role = getRole(room, userKey)
    if (role !== ROLE_OWNER) {
      socket.emit('notice', { kind: 'info', message: 'Only the owner can change room privacy.' })
      return
    }
    const nextPrivate = payload?.private === true
    if (nextPrivate && !getInviteSecret()) {
      socket.emit('notice', {
        kind: 'info',
        message: 'Invite links are disabled on this server (set INVITE_SECRET).',
      })
      return
    }
    room.private = nextPrivate
    io.to(roomId).emit('room:privacy', { private: nextPrivate })
    addAudit(
      roomId,
      room,
      createAuditEntry({ kind: 'privacy', actor: user, role: nextPrivate ? 'private' : 'public' }),
    )
  })

  socket.on('invite:create', (payload) => {
    const role = getRole(room, userKey)
    if (!canModerate(role)) {
      socket.emit('notice', { kind: 'info', message: 'Only moderators can create invite links.' })
      return
    }
    if (!room.private) {
      socket.emit('notice', { kind: 'info', message: 'Enable invite-only mode before creating invites.' })
      return
    }
    const secret = getInviteSecret()
    if (!secret) {
      socket.emit('notice', { kind: 'info', message: 'Invite links are disabled on this server.' })
      return
    }

    const ttlMsRaw = payload?.ttlMs
    const ttlMs = Number.isFinite(ttlMsRaw) ? Math.floor(ttlMsRaw) : 15 * 60 * 1000
    const clamped = Math.max(60_000, Math.min(24 * 60 * 60 * 1000, ttlMs))
    const rotate = payload?.rotate === true
    if (!Number.isFinite(room.inviteVersion)) room.inviteVersion = 0
    if (rotate) {
      room.inviteVersion = Math.max(0, Math.floor(room.inviteVersion)) + 1
      addAudit(roomId, room, createAuditEntry({ kind: 'invite', actor: user, role: 'regenerated' }))
    } else {
      addAudit(roomId, room, createAuditEntry({ kind: 'invite', actor: user, role: 'created' }))
    }
    const expMs = Date.now() + clamped
    const token = createInviteToken({ roomId, expiresAtMs: expMs, secret, version: room.inviteVersion })
    if (!token) return
    socket.emit('invite:created', {
      token,
      expiresAt: new Date(expMs).toISOString(),
      version: room.inviteVersion,
    })
  })

  socket.on('invite:revoke', () => {
    const role = getRole(room, userKey)
    if (!canModerate(role)) {
      socket.emit('notice', { kind: 'info', message: 'Only moderators can revoke invites.' })
      return
    }
    if (!room.private) {
      socket.emit('notice', { kind: 'info', message: 'Enable invite-only mode before revoking invites.' })
      return
    }
    const secret = getInviteSecret()
    if (!secret) {
      socket.emit('notice', { kind: 'info', message: 'Invite links are disabled on this server.' })
      return
    }

    if (!Number.isFinite(room.inviteVersion)) room.inviteVersion = 0
    room.inviteVersion = Math.max(0, Math.floor(room.inviteVersion)) + 1
    io.to(roomId).emit('invite:revoked', { version: room.inviteVersion })
    addAudit(roomId, room, createAuditEntry({ kind: 'invite', actor: user, role: 'revoked' }))
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
    if (!removed || removed.length === 0) {
      socket.emit('notice', { kind: 'info', message: 'Nothing to undo.' })
      return
    }
    persistence.scheduleSave(roomId, room)
    for (const stroke of removed) {
      if (!stroke?.id) continue
      io.to(roomId).emit('stroke:remove', { id: stroke.id })
    }
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
    if (!restored || restored.length === 0) {
      socket.emit('notice', { kind: 'info', message: 'Nothing to redo.' })
      return
    }
    while (room.strokes.length > LIMITS.maxStrokes) {
      room.strokes.shift()
    }
    persistence.scheduleSave(roomId, room)
    for (const stroke of restored) {
      io.to(roomId).emit('stroke:add', stroke)
    }
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
    room.images = []
    room.imageBytes = 0
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
      reactions: {},
    }
    room.messages.push(entry)
    if (room.messages.length > LIMITS.maxMessages) {
      const removed = room.messages.shift()
      if (removed?.id && room.pinnedId === removed.id) {
        room.pinnedId = null
        io.to(roomId).emit('chat:pin', { pinnedId: null })
      }
    }
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('chat:message', entry)
  })

  socket.on('chat:react', (payload) => {
    if (room.locked) {
      socket.emit('notice', { kind: 'info', message: 'Room is locked.' })
      return
    }
    if (isViewOnly) return
    const limit = reactionLimiter.check()
    if (!limit.allowed) {
      socket.emit('notice', {
        kind: 'rate_limited',
        scope: 'reaction',
        retryAfterMs: limit.retryAfterMs,
      })
      return
    }

    const messageId = sanitizeMessageId(payload?.id)
    const reaction = sanitizeReaction(payload?.reaction, REACTIONS)
    if (!messageId || !reaction) return

    const message = room.messages.find((entry) => entry.id === messageId)
    if (!message) return

    const reactions = message.reactions && typeof message.reactions === 'object' ? message.reactions : {}
    const list = Array.isArray(reactions[reaction]) ? reactions[reaction].slice() : []
    const index = list.indexOf(socket.id)
    if (index >= 0) {
      list.splice(index, 1)
    } else {
      list.push(socket.id)
    }
    if (list.length === 0) {
      delete reactions[reaction]
    } else {
      reactions[reaction] = list
    }
    message.reactions = reactions
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('chat:reaction', { id: messageId, reactions })
  })

  socket.on('chat:pin', (payload) => {
    if (isViewOnly) return
    const role = getRole(room, userKey)
    if (!canModerate(role)) {
      socket.emit('notice', { kind: 'info', message: 'Only moderators can pin messages.' })
      return
    }
    const messageId = sanitizeMessageId(payload?.id)
    if (!messageId) return
    const exists = room.messages.some((entry) => entry.id === messageId)
    if (!exists) return

    const nextPinnedId = room.pinnedId === messageId ? null : messageId
    room.pinnedId = nextPinnedId
    persistence.scheduleSave(roomId, room)
    io.to(roomId).emit('chat:pin', { pinnedId: nextPinnedId })
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
      if (persistence.enabled) {
        void persistence.flush(roomId, room).catch(() => {})
        rooms.delete(roomId)
        return
      }
      if (ROOM_IDLE_TTL_MS <= 0) {
        rooms.delete(roomId)
        return
      }
      room.emptySinceMs = Date.now()
    }
    persistence.scheduleSave(roomId, room)
  })
})

server.listen(PORT, () => {
  const address = server.address()
  const port = address && typeof address === 'object' ? address.port : PORT
  console.log(`Sketchboard server running on http://localhost:${port}`)
})
