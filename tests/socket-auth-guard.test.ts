// @vitest-environment node
import { spawn } from 'node:child_process'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { io as clientIo, type Socket } from 'socket.io-client'

type InitPayload = {
  selfId: string
  locked: boolean
}

type Notice =
  | { kind: 'info'; message: string }
  | { kind: 'rate_limited'; scope: string; retryAfterMs: number }

function assertInitPayload(payload: unknown): asserts payload is InitPayload {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid init payload')
  const record = payload as Record<string, unknown>
  if (typeof record.selfId !== 'string') throw new Error('Invalid init payload: selfId')
  if (typeof record.locked !== 'boolean') throw new Error('Invalid init payload: locked')
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

async function connectClient({
  port,
  room,
  userKey,
  authToken,
}: {
  port: number
  room: string
  userKey: string
  authToken?: string
}): Promise<{ socket: Socket; init: InitPayload }> {
  const socket = clientIo(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { room, mode: 'edit', userKey, authToken },
  })

  const initRaw = await waitForEvent<unknown>(socket, 'init', 5000)
  assertInitPayload(initRaw)
  const init = initRaw
  return { socket, init }
}

async function connectExpectReject({
  port,
  room,
  userKey,
  authToken,
}: {
  port: number
  room: string
  userKey: string
  authToken?: string
}): Promise<{ socket: Socket; notice: Notice }> {
  const socket = clientIo(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { room, mode: 'edit', userKey, authToken },
  })

  const notice = await waitForEvent<Notice>(socket, 'notice', 5000)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for disconnect')), 5000)
    socket.once('disconnect', () => {
      clearTimeout(timeout)
      resolve()
    })
  })

  return { socket, notice }
}

function shutdownSocket(socket: Socket | null) {
  if (!socket) return
  if (socket.connected) socket.disconnect()
}

describe('socket auth guard', () => {
  let child: ReturnType<typeof spawn> | null = null
  let port = 0

  beforeAll(async () => {
    const serverPath = path.resolve(process.cwd(), 'server/index.mjs')
    child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: '0', AUTH_TOKEN: 'test-auth-token' },
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

    if (!Number.isFinite(port) || port <= 0) throw new Error(`Invalid server port: ${port}`)
  })

  afterAll(async () => {
    if (!child) return
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      child?.once('exit', () => resolve())
      setTimeout(() => resolve(), 2000)
    })
  })

  it('rejects clients without the auth token', async () => {
    const room = `room-auth-${Date.now()}`
    const rejected = await connectExpectReject({ port, room, userKey: 'user-no-token' })
    expect(rejected.notice.kind).toBe('info')
    expect(String(rejected.notice.message)).toMatch(/access token/i)
    shutdownSocket(rejected.socket)
  })

  it('allows clients with the auth token', async () => {
    const room = `room-auth-ok-${Date.now()}`
    const ok = await connectClient({ port, room, userKey: 'user-with-token', authToken: 'test-auth-token' })
    expect(ok.init.locked).toBe(false)
    shutdownSocket(ok.socket)
  })
})
