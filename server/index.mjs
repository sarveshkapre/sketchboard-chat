import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'
import { Server } from 'socket.io'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
})

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000

const state = {
  strokes: [],
  messages: [],
  users: new Map(),
}

const LIMITS = {
  maxStrokePoints: 2000,
  maxMessageLength: 400,
  maxMessages: 200,
  maxStrokes: 1000,
}

const colors = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#9b5de5']

function randomName() {
  const animals = ['Fox', 'Otter', 'Lynx', 'Panda', 'Hawk', 'Koala', 'Tiger']
  const adjective = ['Swift', 'Calm', 'Bold', 'Bright', 'Witty', 'Wild']
  return `${adjective[Math.floor(Math.random() * adjective.length)]} ${
    animals[Math.floor(Math.random() * animals.length)]
  }`
}

function snapshotUsers() {
  return Array.from(state.users.values())
}

function broadcastPresence() {
  io.emit('presence:update', snapshotUsers())
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
  const user = {
    id: socket.id,
    name: randomName(),
    color: colors[Math.floor(Math.random() * colors.length)],
    cursor: { x: 0, y: 0 },
    active: true,
  }

  state.users.set(socket.id, user)

  socket.emit('init', {
    strokes: state.strokes,
    messages: state.messages,
    users: snapshotUsers(),
    selfId: socket.id,
  })

  broadcastPresence()

  socket.on('stroke:add', (stroke) => {
    if (!stroke?.points?.length) return
    if (stroke.points.length > LIMITS.maxStrokePoints) return
    state.strokes.push(stroke)
    if (state.strokes.length > LIMITS.maxStrokes) {
      state.strokes.shift()
    }
    socket.broadcast.emit('stroke:add', stroke)
  })

  socket.on('board:clear', () => {
    state.strokes = []
    io.emit('board:clear')
  })

  socket.on('chat:message', (message) => {
    if (!message?.text?.trim()) return
    const text = message.text.trim().slice(0, LIMITS.maxMessageLength)
    const entry = {
      id: message.id,
      text,
      userId: socket.id,
      createdAt: new Date().toISOString(),
    }
    state.messages.push(entry)
    if (state.messages.length > LIMITS.maxMessages) {
      state.messages.shift()
    }
    io.emit('chat:message', entry)
  })

  socket.on('presence:cursor', (cursor) => {
    const current = state.users.get(socket.id)
    if (!current) return
    if (typeof cursor?.x !== 'number' || typeof cursor?.y !== 'number') return
    current.cursor = cursor
    io.emit('presence:update', snapshotUsers())
  })

  socket.on('disconnect', () => {
    state.users.delete(socket.id)
    broadcastPresence()
  })
})

server.listen(PORT, () => {
  console.log(`Sketchboard server running on http://localhost:${PORT}`)
})
