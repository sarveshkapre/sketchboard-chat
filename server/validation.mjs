import crypto from 'node:crypto'

const DEFAULT_ROOM_ID = 'main'

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function safeTrimString(value, maxLength) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function clampNumber(value, min, max) {
  if (!isFiniteNumber(value)) return null
  return Math.max(min, Math.min(max, value))
}

export function createId(prefix) {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function parseCorsOrigin(value) {
  if (!value) return '*'
  const raw = value.trim()
  if (!raw || raw === '*') return '*'
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return '*'
  if (parts.length === 1) return parts[0]
  return parts
}

export function sanitizeRoomId(value) {
  if (typeof value !== 'string') return DEFAULT_ROOM_ID
  const raw = value.trim().toLowerCase()
  if (!raw) return DEFAULT_ROOM_ID

  const cleaned = raw
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 40)

  return cleaned || DEFAULT_ROOM_ID
}

export function sanitizeCursor(input) {
  if (!input || typeof input !== 'object') return null
  const x = input.x
  const y = input.y
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null
  return { x, y }
}

export function sanitizeStroke(input, limits) {
  if (!input || typeof input !== 'object') return null

  const points = Array.isArray(input.points) ? input.points : []
  if (points.length === 0 || points.length > limits.maxStrokePoints) return null

  const normalizedPoints = []
  for (const point of points) {
    if (!point || typeof point !== 'object') return null
    const x = point.x
    const y = point.y
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null
    normalizedPoints.push({ x, y })
  }

  const tool = input.tool === 'eraser' ? 'eraser' : 'pen'
  const id = safeTrimString(input.id, 80) || createId('stroke')
  const batchId = safeTrimString(input.batchId, 80)
  const color = safeTrimString(input.color, 32) || '#4d96ff'

  const size = isFiniteNumber(input.size) ? input.size : 4
  const normalizedSize = Math.max(1, Math.min(50, size))

  const stroke = {
    id,
    color,
    size: normalizedSize,
    tool,
    points: normalizedPoints,
  }
  if (batchId) {
    stroke.batchId = batchId
  }
  return stroke
}

export function sanitizeChatMessage(input, limits) {
  if (!input || typeof input !== 'object') return null

  const text = safeTrimString(input.text, limits.maxMessageLength)
  if (!text) return null

  const id = safeTrimString(input.id, 80) || createId('msg')
  return { id, text }
}

export function sanitizeMessageId(value) {
  return safeTrimString(value, 80)
}

export function sanitizeReaction(value, allowed = []) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (allowed.length > 0 && !allowed.includes(trimmed)) return null
  return trimmed
}

export function sanitizeUserProfile(input) {
  if (!input || typeof input !== 'object') return null

  const name = safeTrimString(input.name, 24)
  const color =
    typeof input.color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(input.color)
      ? input.color.toLowerCase()
      : null

  if (!name && !color) return null

  return { name, color }
}

function sanitizeImageDataUrl(value, options) {
  const maxBytes = Number.isFinite(options?.maxBytes) ? Math.max(1, Math.floor(options.maxBytes)) : 1_000_000
  const allowed = Array.isArray(options?.allowedMime) ? options.allowedMime : []

  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length > maxBytes * 2.5) return null

  // Intentionally only support base64 data URLs for raster images.
  const match = trimmed.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) return null
  const mime = match[1].toLowerCase()
  if (allowed.length > 0 && !allowed.includes(mime)) return null

  const base64 = match[2]
  const approxBytes = Math.floor((base64.length * 3) / 4)
  if (!Number.isFinite(approxBytes) || approxBytes <= 0 || approxBytes > maxBytes) return null

  let buffer
  try {
    buffer = Buffer.from(base64, 'base64')
  } catch {
    return null
  }
  if (!buffer || buffer.length <= 0 || buffer.length > maxBytes) return null

  // Normalize to a canonical base64 string (avoids weird/invalid base64 inputs).
  const normalized = buffer.toString('base64')
  return { mime, bytes: buffer.length, dataUrl: `data:${mime};base64,${normalized}` }
}

export function sanitizeBoardImage(input, limits) {
  if (!input || typeof input !== 'object') return null

  const id = safeTrimString(input.id, 80) || createId('img')
  const data = sanitizeImageDataUrl(input.dataUrl, {
    maxBytes: Number.isFinite(limits?.maxImageBytes) ? limits.maxImageBytes : 1_000_000,
    allowedMime: Array.isArray(limits?.allowedImageMime) ? limits.allowedImageMime : [],
  })
  if (!data) return null

  const x = clampNumber(input.x, -50_000, 50_000)
  const y = clampNumber(input.y, -50_000, 50_000)
  const w = clampNumber(input.w, 8, 10_000)
  const h = clampNumber(input.h, 8, 10_000)
  if (x === null || y === null || w === null || h === null) return null

  return {
    id,
    dataUrl: data.dataUrl,
    mime: data.mime,
    bytes: data.bytes,
    x,
    y,
    w,
    h,
  }
}

export function sanitizeBoardImageUpdate(input) {
  if (!input || typeof input !== 'object') return null
  const id = safeTrimString(input.id, 80)
  if (!id) return null

  const x = clampNumber(input.x, -50_000, 50_000)
  const y = clampNumber(input.y, -50_000, 50_000)
  const w = clampNumber(input.w, 8, 10_000)
  const h = clampNumber(input.h, 8, 10_000)
  if (x === null || y === null || w === null || h === null) return null

  return { id, x, y, w, h }
}
