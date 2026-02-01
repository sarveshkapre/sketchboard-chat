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

const CURSOR_BROADCAST_MIN_INTERVAL_MS = 33

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
  }
}

function getRoom(roomId) {
  const existing = rooms.get(roomId)
  if (existing) return existing
  const created = createRoomState()
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

const distPath = path.resolve(__dirname, '../dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

io.on('connection', (socket) => {
  const rawRoom =
    socket.handshake.auth?.room ??
    (typeof socket.handshake.query?.room === 'string' ? socket.handshake.query.room : '')
  const roomId = sanitizeRoomId(rawRoom)
  const room = getRoom(roomId)
  socket.join(roomId)

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
  })

  broadcastPresence(roomId, room)

  socket.on('stroke:add', (stroke) => {
    const sanitized = sanitizeStroke(stroke, LIMITS)
    if (!sanitized) return
    room.strokes.push(sanitized)
    if (room.strokes.length > LIMITS.maxStrokes) {
      room.strokes.shift()
    }
    socket.to(roomId).emit('stroke:add', sanitized)
  })

  socket.on('board:clear', () => {
    room.strokes = []
    io.to(roomId).emit('board:clear')
  })

  socket.on('chat:message', (message) => {
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
    broadcastPresence(roomId, room)
    if (room.users.size === 0) {
      rooms.delete(roomId)
    }
  })
})

server.listen(PORT, () => {
  console.log(`Sketchboard server running on http://localhost:${PORT}`)
})
