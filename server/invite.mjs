import crypto from 'node:crypto'

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url')
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export function createInviteToken({ roomId, expiresAtMs, secret }) {
  if (!secret) return null
  if (!roomId) return null
  if (!Number.isFinite(expiresAtMs)) return null

  const payload = { v: 1, roomId, exp: Math.floor(expiresAtMs) }
  const encoded = base64UrlEncode(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${sig}`
}

export function verifyInviteToken({ token, roomId, secret, nowMs = Date.now() }) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' }
  if (!secret) return { ok: false, reason: 'disabled' }

  const trimmed = token.trim()
  const match = trimmed.match(/^([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$/)
  if (!match) return { ok: false, reason: 'format' }
  const encoded = match[1]
  const providedSig = match[2]
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  if (!timingSafeEqual(providedSig, expectedSig)) return { ok: false, reason: 'sig' }

  let parsed
  try {
    parsed = JSON.parse(base64UrlDecode(encoded))
  } catch {
    return { ok: false, reason: 'payload' }
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'payload' }
  if (parsed.v !== 1) return { ok: false, reason: 'version' }
  if (typeof parsed.roomId !== 'string' || parsed.roomId !== roomId) return { ok: false, reason: 'room' }
  if (!Number.isFinite(parsed.exp)) return { ok: false, reason: 'exp' }
  if (nowMs > parsed.exp) return { ok: false, reason: 'expired' }

  return { ok: true, exp: parsed.exp }
}

