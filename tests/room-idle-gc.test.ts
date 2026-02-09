// @vitest-environment node
import { spawn } from 'node:child_process'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { io as clientIo, type Socket } from 'socket.io-client'

type InitPayload = { selfId: string }

function assertInitPayload(payload: unknown): asserts payload is InitPayload {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid init payload')
  const record = payload as Record<string, unknown>
  if (typeof record.selfId !== 'string') throw new Error('Invalid init payload: selfId')
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent)
      reject(new Error(`Timed out waiting for ${event}`))
    }, timeoutMs)

    const onEvent = (payload: T) => {
      clearTimeout(timeout)
      resolve(payload)
    }

    socket.once(event, onEvent)
  })
}

async function connectClient(port: number, room: string): Promise<{ socket: Socket; init: InitPayload }> {
  const socket = clientIo(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { room, mode: 'edit', userKey: `k-${Date.now()}` },
  })

  const initRaw = await waitForEvent<unknown>(socket, 'init', 6000)
  assertInitPayload(initRaw)
  return { socket, init: initRaw }
}

async function fetchRooms(port: number) {
  const response = await fetch(`http://localhost:${port}/api/rooms`)
  if (!response.ok) {
    throw new Error(`Rooms API failed: ${response.status}`)
  }
  const json = (await response.json()) as { rooms?: unknown[] }
  return Array.isArray(json.rooms) ? json.rooms : []
}

function roomIdFromMetrics(value: unknown) {
  if (!value || typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  return typeof record.roomId === 'string' ? record.roomId : ''
}

describe('room idle GC', () => {
  let child: ReturnType<typeof spawn> | null = null
  let port = 0

  beforeAll(async () => {
    const serverPath = path.resolve(process.cwd(), 'server/index.mjs')
    child = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: '0',
        ROOM_IDLE_TTL_MS: '1100',
        ROOM_GC_INTERVAL_MS: '1000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdout = child.stdout
    if (!stdout) throw new Error('Missing server stdout')

    port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for server to start')), 8000)
      let buffer = ''
      stdout.on('data', (chunk) => {
        buffer += String(chunk)
        const match = buffer.match(/http:\/\/localhost:(\d+)/)
        if (!match) return
        clearTimeout(timeout)
        resolve(Number(match[1]))
      })
      child?.once('exit', (code) => {
        clearTimeout(timeout)
        reject(new Error(`Server exited before ready (code ${code ?? 'unknown'})`))
      })
    })
  })

  afterAll(async () => {
    if (!child) return
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      child?.once('exit', () => resolve())
      setTimeout(() => resolve(), 2000)
    })
  })

  it(
    'retains empty rooms briefly then evicts them when persistence is off',
    async () => {
      const roomId = `room-idle-${Date.now()}`
      const { socket } = await connectClient(port, roomId)
      socket.disconnect()

      // Give the server a moment to process disconnect.
      await new Promise((resolve) => setTimeout(resolve, 150))

      const roomsAfterDisconnect = await fetchRooms(port)
      expect(roomsAfterDisconnect.some((room) => roomIdFromMetrics(room) === roomId)).toBe(true)

      // Wait for TTL + at least one GC tick.
      await new Promise((resolve) => setTimeout(resolve, 2600))

      const roomsAfterGc = await fetchRooms(port)
      expect(roomsAfterGc.some((room) => roomIdFromMetrics(room) === roomId)).toBe(false)
    },
    15_000,
  )
})
