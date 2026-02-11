// @vitest-environment node
import { spawn } from 'node:child_process'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('content security policy header', () => {
  let child: ReturnType<typeof spawn> | null = null
  let port = 0

  beforeAll(async () => {
    const serverPath = path.resolve(process.cwd(), 'server/index.mjs')
    child = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: '0',
        NODE_ENV: 'production',
        CORS_ORIGIN: 'http://localhost:5173',
      },
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
  })

  afterAll(async () => {
    if (!child) return
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      child?.once('exit', () => resolve())
      setTimeout(() => resolve(), 2000)
    })
  })

  it('sets a default CSP header in production', async () => {
    const response = await fetch(`http://localhost:${port}/health`)
    expect(response.status).toBe(200)
    const csp = response.headers.get('content-security-policy')
    expect(csp).toBeTruthy()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("connect-src 'self' ws: wss:")
    expect(csp).toContain("object-src 'none'")
  })
})
