// @vitest-environment node
import { spawn } from 'node:child_process'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { io as clientIo, type Socket } from 'socket.io-client'

type InitPayload = {
  selfId: string
  images: unknown[]
}

function assertInitPayload(payload: unknown): asserts payload is InitPayload {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid init payload')
  const record = payload as Record<string, unknown>
  if (typeof record.selfId !== 'string') throw new Error('Invalid init payload: selfId')
  if (!Array.isArray(record.images)) throw new Error('Invalid init payload: images')
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
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

async function expectNoEvent(socket: Socket, event: string, timeoutMs = 400) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, onEvent)
      resolve()
    }, timeoutMs)
    const onEvent = () => {
      clearTimeout(timeout)
      reject(new Error(`Did not expect ${event}`))
    }
    socket.once(event, onEvent)
  })
}

async function connectClient({
  port,
  room,
  userKey,
}: {
  port: number
  room: string
  userKey: string
}): Promise<{ socket: Socket; init: InitPayload }> {
  const socket = clientIo(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { room, mode: 'edit', userKey },
  })

  const initRaw = await waitForEvent<unknown>(socket, 'init', 5000)
  assertInitPayload(initRaw)
  return { socket, init: initRaw }
}

function shutdownSocket(socket: Socket | null) {
  if (!socket) return
  if (socket.connected) socket.disconnect()
}

describe('socket image flows', () => {
  let child: ReturnType<typeof spawn> | null = null
  let port = 0

  beforeAll(async () => {
    const serverPath = path.resolve(process.cwd(), 'server/index.mjs')
    child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: '0', ROOM_MAX_IMAGE_BYTES: '120' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdout = child.stdout
    if (!stdout) throw new Error('Missing server stdout')

    port = await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out waiting for server to start')),
        8000,
      )

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

    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`Invalid server port: ${port}`)
    }
  })

  afterAll(async () => {
    if (!child) return
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      child?.once('exit', () => resolve())
      setTimeout(() => resolve(), 2000)
    })
  })

  it('broadcasts image add/update/remove only within a room', async () => {
    const roomA = `room-img-a-${Date.now()}`
    const roomB = `room-img-b-${Date.now()}`

    const a1 = await connectClient({ port, room: roomA, userKey: 'a1' })
    const a2 = await connectClient({ port, room: roomA, userKey: 'a2' })
    const b1 = await connectClient({ port, room: roomB, userKey: 'b1' })

    expect(a1.init.images).toEqual([])
    expect(a2.init.images).toEqual([])

    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2bkAAAAASUVORK5CYII='

    a1.socket.emit('image:add', { id: 'img-1', dataUrl: tinyPng, x: 10, y: 20, w: 100, h: 80 })
    const addA1 = await waitForEvent<{ id: string }>(a1.socket, 'image:add')
    const addA2 = await waitForEvent<{ id: string }>(a2.socket, 'image:add')
    expect(addA1.id).toBe('img-1')
    expect(addA2.id).toBe('img-1')
    await expectNoEvent(b1.socket, 'image:add')

    a1.socket.emit('image:update', { id: 'img-1', x: 11, y: 22, w: 100, h: 80 })
    const updateA2 = await waitForEvent<{ id: string; x: number }>(a2.socket, 'image:update')
    expect(updateA2.id).toBe('img-1')
    expect(updateA2.x).toBe(11)

    a2.socket.emit('image:remove', { id: 'img-1' })
    const removeA1 = await waitForEvent<{ id: string }>(a1.socket, 'image:remove')
    expect(removeA1.id).toBe('img-1')
    await expectNoEvent(b1.socket, 'image:remove')

    shutdownSocket(b1.socket)
    shutdownSocket(a2.socket)
    shutdownSocket(a1.socket)
  })

  it('enforces a per-room image byte cap', async () => {
    const room = `room-img-cap-${Date.now()}`
    const a1 = await connectClient({ port, room, userKey: 'cap-a1' })
    const a2 = await connectClient({ port, room, userKey: 'cap-a2' })

    const approx600BytesPng = `data:image/png;base64,${'A'.repeat(800)}`

    a1.socket.emit('image:add', { id: 'img-cap-1', dataUrl: approx600BytesPng, x: 1, y: 1, w: 40, h: 30 })
    await waitForEvent<{ id: string }>(a1.socket, 'image:add')
    await waitForEvent<{ id: string }>(a2.socket, 'image:add')

    a1.socket.emit('image:add', { id: 'img-cap-2', dataUrl: approx600BytesPng, x: 2, y: 2, w: 40, h: 30 })
    const notice = await waitForEvent<{ kind?: string; message?: string }>(a1.socket, 'notice')
    expect(notice.kind).toBe('info')
    expect(String(notice.message || '')).toMatch(/storage limit/i)
    await expectNoEvent(a2.socket, 'image:add')

    shutdownSocket(a2.socket)
    shutdownSocket(a1.socket)
  })
})
