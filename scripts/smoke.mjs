import { spawn } from 'node:child_process'
import path from 'node:path'
import { io } from 'socket.io-client'

function waitForLine(stream, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for ${pattern}`))
    }, timeoutMs)

    function onData(chunk) {
      buffer += String(chunk)
      const match = buffer.match(pattern)
      if (!match) return
      cleanup()
      resolve(match)
    }

    function cleanup() {
      clearTimeout(timeout)
      stream.off('data', onData)
    }

    stream.on('data', onData)
  })
}

function waitForEvent(socket, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for socket event: ${eventName}`))
    }, timeoutMs)

    function onEvent(payload) {
      cleanup()
      resolve(payload)
    }

    function cleanup() {
      clearTimeout(timeout)
      socket.off(eventName, onEvent)
    }

    socket.on(eventName, onEvent)
  })
}

function makeKey(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`
}

async function runRoomIsolationSmoke(serverUrl) {
  const roomA = `smoke-a-${Date.now().toString(16)}`
  const roomB = `smoke-b-${Date.now().toString(16)}`

  const a1 = io(serverUrl, {
    transports: ['websocket'],
    reconnection: false,
    auth: { room: roomA, mode: 'edit', userKey: makeKey('a1') },
  })
  const a2 = io(serverUrl, {
    transports: ['websocket'],
    reconnection: false,
    auth: { room: roomA, mode: 'edit', userKey: makeKey('a2') },
  })
  const b1 = io(serverUrl, {
    transports: ['websocket'],
    reconnection: false,
    auth: { room: roomB, mode: 'edit', userKey: makeKey('b1') },
  })

  try {
    await Promise.all([waitForEvent(a1, 'init', 4000), waitForEvent(a2, 'init', 4000), waitForEvent(b1, 'init', 4000)])

    let leakedStroke = false
    let leakedChat = false

    b1.on('stroke:add', () => {
      leakedStroke = true
    })
    b1.on('chat:message', () => {
      leakedChat = true
    })

    const strokePromise = waitForEvent(a2, 'stroke:add', 1500)
    a1.emit('stroke:add', {
      id: 'smoke-stroke',
      color: '#4d96ff',
      size: 4,
      tool: 'pen',
      points: [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    })
    await strokePromise

    // Give the server a brief window to incorrectly deliver cross-room events.
    await new Promise((r) => setTimeout(r, 300))
    if (leakedStroke) throw new Error('Room isolation failed: stroke leaked to another room')

    const chatPromise = waitForEvent(a2, 'chat:message', 1500)
    a1.emit('chat:message', { id: 'smoke-msg', text: 'smoke hello' })
    await chatPromise

    await new Promise((r) => setTimeout(r, 300))
    if (leakedChat) throw new Error('Room isolation failed: chat leaked to another room')
  } finally {
    a1.disconnect()
    a2.disconnect()
    b1.disconnect()
  }
}

async function main() {
  const serverPath = path.resolve(process.cwd(), 'server/index.mjs')
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let exited = false
  child.once('exit', (code) => {
    exited = true
    if (code && code !== 0) {
      process.exitCode = code
    }
  })

  child.stderr?.pipe(process.stderr)
  if (!child.stdout) throw new Error('Missing server stdout')

  let port = 0
  try {
    const match = await waitForLine(child.stdout, /http:\/\/localhost:(\d+)/, 8000)
    port = Number(match[1])
  } catch (err) {
    child.kill('SIGTERM')
    throw err
  }

  if (!Number.isFinite(port) || port <= 0) {
    child.kill('SIGTERM')
    throw new Error(`Invalid server port: ${port}`)
  }

  const url = `http://localhost:${port}/health`
  const deadlineAt = Date.now() + 8000
  let lastError = null

  while (Date.now() < deadlineAt) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.text()
      process.stdout.write(`${body}\n`)
      break
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  if (!lastError) {
    await runRoomIsolationSmoke(`http://localhost:${port}`)
  }

  // Always best-effort stop the server.
  if (!exited) {
    child.kill('SIGTERM')
    await new Promise((resolve) => {
      child.once('exit', () => resolve())
      setTimeout(() => resolve(), 2000)
    })
  }

  if (lastError) {
    throw new Error(`Smoke check failed for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`)
  process.exitCode = 1
})
