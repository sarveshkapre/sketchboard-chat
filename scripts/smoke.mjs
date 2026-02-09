import { spawn } from 'node:child_process'
import path from 'node:path'

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

