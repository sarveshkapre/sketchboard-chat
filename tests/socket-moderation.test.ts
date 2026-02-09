// @vitest-environment node
import { spawn } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { io as clientIo, type Socket } from 'socket.io-client'

type InitPayload = {
  selfId: string
  locked: boolean
}

type PublicUser = {
  id: string
  name?: string
  color?: string
  role?: 'owner' | 'mod' | 'member'
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

function waitForPresence(
  socket: Socket,
  predicate: (users: PublicUser[]) => boolean,
  timeoutMs = 3000,
): Promise<PublicUser[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('presence:update', onUpdate)
      reject(new Error('Timed out waiting for presence:update condition'))
    }, timeoutMs)

    const onUpdate = (users: PublicUser[]) => {
      if (!Array.isArray(users)) return
      if (!predicate(users)) return
      clearTimeout(timeout)
      socket.off('presence:update', onUpdate)
      resolve(users)
    }

    socket.on('presence:update', onUpdate)
  })
}

async function connectClient({
  port,
  room,
  userKey,
  mode = 'edit',
}: {
  port: number
  room: string
  userKey: string
  mode?: 'edit' | 'view'
}): Promise<{ socket: Socket; init: InitPayload }> {
  const socket = clientIo(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { room, mode, userKey },
  })

  const initRaw = await waitForEvent<unknown>(socket, 'init', 5000)
  assertInitPayload(initRaw)
  const init = initRaw
  return { socket, init }
}

function shutdownSocket(socket: Socket | null) {
  if (!socket) return
  if (socket.connected) socket.disconnect()
}

describe('socket moderation flows', () => {
  let child: ReturnType<typeof spawn> | null = null
  let port = 0

  beforeAll(async () => {
    const serverPath = path.resolve(process.cwd(), 'server/index.mjs')
    child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: '0' },
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

  it('owner can lock/unlock and members are blocked while locked', async () => {
    const room = `room-lock-${Date.now()}`
    const owner = await connectClient({ port, room, userKey: 'owner-1' })
    const member = await connectClient({ port, room, userKey: 'member-1' })

    expect(owner.init.locked).toBe(false)
    expect(member.init.locked).toBe(false)

    owner.socket.emit('room:lock')
    const lock1 = await waitForEvent<{ locked: boolean }>(owner.socket, 'room:lock')
    const lock2 = await waitForEvent<{ locked: boolean }>(member.socket, 'room:lock')
    expect(lock1.locked).toBe(true)
    expect(lock2.locked).toBe(true)

    // Member cannot chat while locked.
    member.socket.emit('chat:message', { id: 'm1', text: 'hello' })
    const notice = await waitForEvent<Notice>(member.socket, 'notice')
    expect(notice.kind).toBe('info')
    expect(String(notice.message)).toMatch(/locked/i)

    owner.socket.emit('room:unlock')
    const unlock1 = await waitForEvent<{ locked: boolean }>(owner.socket, 'room:lock')
    const unlock2 = await waitForEvent<{ locked: boolean }>(member.socket, 'room:lock')
    expect(unlock1.locked).toBe(false)
    expect(unlock2.locked).toBe(false)

    shutdownSocket(member.socket)
    shutdownSocket(owner.socket)
  })

  it('owner can promote to mod; mod cannot change roles; mod cannot kick owner', async () => {
    const room = `room-roles-${Date.now()}`
    const owner = await connectClient({ port, room, userKey: 'owner-2' })
    const mod = await connectClient({ port, room, userKey: 'mod-1' })
    const member = await connectClient({ port, room, userKey: 'member-2' })

    owner.socket.emit('role:set', { userId: mod.init.selfId, role: 'mod' })
    const presence = await waitForPresence(
      owner.socket,
      (users) => users.find((u) => u.id === mod.init.selfId)?.role === 'mod',
      5000,
    )
    expect(presence.find((u) => u.id === mod.init.selfId)?.role).toBe('mod')

    // Mod cannot change roles.
    mod.socket.emit('role:set', { userId: member.init.selfId, role: 'mod' })
    const notice = await waitForEvent<Notice>(mod.socket, 'notice')
    expect(notice.kind).toBe('info')
    expect(String(notice.message)).toMatch(/only the owner/i)

    // Mod cannot kick owner.
    mod.socket.emit('room:kick', { userId: owner.init.selfId })
    const noticeKick = await waitForEvent<Notice>(mod.socket, 'notice')
    expect(noticeKick.kind).toBe('info')
    expect(String(noticeKick.message)).toMatch(/mods can only remove members|only the owner/i)

    shutdownSocket(member.socket)
    shutdownSocket(mod.socket)
    shutdownSocket(owner.socket)
  })

  it('owner can kick a member (member disconnects)', async () => {
    const room = `room-kick-${Date.now()}`
    const owner = await connectClient({ port, room, userKey: 'owner-3' })
    const member = await connectClient({ port, room, userKey: 'member-3' })

    owner.socket.emit('room:kick', { userId: member.init.selfId })
    const kickedNotice = await waitForEvent<Notice>(member.socket, 'notice')
    expect(kickedNotice.kind).toBe('info')
    expect(String(kickedNotice.message)).toMatch(/removed/i)

    const disconnected = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for disconnect')), 4000)
      member.socket.once('disconnect', (reason) => {
        clearTimeout(timeout)
        resolve(reason)
      })
    })
    expect(disconnected).toBeTruthy()

    shutdownSocket(member.socket)
    shutdownSocket(owner.socket)
  })
})
