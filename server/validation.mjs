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
  const color = safeTrimString(input.color, 32) || '#4d96ff'

  const size = isFiniteNumber(input.size) ? input.size : 4
  const normalizedSize = Math.max(1, Math.min(50, size))

  return {
    id,
    color,
    size: normalizedSize,
    tool,
    points: normalizedPoints,
  }
}

export function sanitizeChatMessage(input, limits) {
  if (!input || typeof input !== 'object') return null

  const text = safeTrimString(input.text, limits.maxMessageLength)
  if (!text) return null

  const id = safeTrimString(input.id, 80) || createId('msg')
  return { id, text }
}
