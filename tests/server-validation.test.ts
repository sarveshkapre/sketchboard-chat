import { describe, expect, it } from 'vitest'

import {
  ensureUniqueMessageId,
  parseCorsOrigin,
  sanitizeChatMessage,
  sanitizeCursor,
  sanitizeBoardImage,
  sanitizeBoardImageUpdate,
  sanitizeMessageId,
  sanitizeReaction,
  sanitizeUserProfile,
  sanitizeRoomId,
  sanitizeStroke,
} from '../server/validation.mjs'

describe('server validation', () => {
  it('parses CORS origin', () => {
    expect(parseCorsOrigin(undefined)).toBe('*')
    expect(parseCorsOrigin('*')).toBe('*')
    expect(parseCorsOrigin('http://localhost:5173')).toBe('http://localhost:5173')
    expect(parseCorsOrigin('a, b')).toEqual(['a', 'b'])
  })

  it('sanitizes room ids', () => {
    expect(sanitizeRoomId()).toBe('main')
    expect(sanitizeRoomId('')).toBe('main')
    expect(sanitizeRoomId('  Team-1 ')).toBe('team-1')
    expect(sanitizeRoomId('../weird room??')).toBe('weird-room')
  })

  it('sanitizes cursor updates', () => {
    expect(sanitizeCursor(null)).toBe(null)
    expect(sanitizeCursor({ x: '1', y: 2 })).toBe(null)
    expect(sanitizeCursor({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 })
  })

  it('sanitizes chat messages', () => {
    const limits = { maxMessageLength: 5 }
    expect(sanitizeChatMessage({}, limits)).toBe(null)
    expect(sanitizeChatMessage({ text: '   ' }, limits)).toBe(null)
    const value = sanitizeChatMessage({ text: '  hello world  ' }, limits)
    expect(value?.text).toBe('hello')
    expect(value?.id.startsWith('msg-')).toBe(true)
  })

  it('sanitizes message ids and reactions', () => {
    expect(sanitizeMessageId('  msg-1  ')).toBe('msg-1')
    expect(sanitizeMessageId(123)).toBe('')

    const allowed = ['👍', '❤️']
    expect(sanitizeReaction('  👍 ', allowed)).toBe('👍')
    expect(sanitizeReaction('😂', allowed)).toBe(null)
  })

  it('ensures unique message ids', () => {
    const existing = [{ id: 'm1' }, { id: 'm2' }]
    expect(ensureUniqueMessageId(existing, 'm3')).toBe('m3')
    const fallback = ensureUniqueMessageId(existing, 'm2')
    expect(fallback).not.toBe('m2')
    expect(fallback.startsWith('msg-')).toBe(true)
  })

  it('sanitizes user profile updates', () => {
    expect(sanitizeUserProfile(null)).toBe(null)
    expect(sanitizeUserProfile({})).toBe(null)
    expect(sanitizeUserProfile({ name: '  Alice  ' })).toEqual({ name: 'Alice', color: null })
    expect(sanitizeUserProfile({ color: '#FFAA00' })).toEqual({ name: '', color: '#ffaa00' })
    expect(sanitizeUserProfile({ name: '  ', color: 'bad' })).toBe(null)
  })

  it('sanitizes strokes', () => {
    const limits = { maxStrokePoints: 2 }
    expect(sanitizeStroke({}, limits)).toBe(null)
    expect(
      sanitizeStroke({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }, limits),
    ).toBe(null)

    const stroke = sanitizeStroke(
      {
        tool: 'eraser',
        size: 500,
        color: '#fff',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      limits,
    )
    expect(stroke?.tool).toBe('eraser')
    expect(stroke?.size).toBe(50)
    expect(stroke?.id.startsWith('stroke-')).toBe(true)
  })

  it('sanitizes optional stroke batch ids', () => {
    const limits = { maxStrokePoints: 4 }
    const withBatch = sanitizeStroke(
      {
        batchId: '  batch-123  ',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      limits,
    )
    expect(withBatch?.batchId).toBe('batch-123')

    const withoutBatch = sanitizeStroke(
      {
        batchId: 42,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      limits,
    )
    expect(withoutBatch?.batchId).toBeUndefined()
  })

  it('sanitizes board images (raster-only) and image updates', () => {
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2bkAAAAASUVORK5CYII='
    const limits = { maxImageBytes: 10_000, allowedImageMime: ['image/png', 'image/jpeg', 'image/webp'] }

    const image = sanitizeBoardImage(
      { id: 'img-1', dataUrl: tinyPng, x: 1, y: 2, w: 100, h: 120 },
      limits,
    )
    expect(image?.id).toBe('img-1')
    expect(image?.mime).toBe('image/png')
    expect(image?.bytes).toBeGreaterThan(0)

    expect(sanitizeBoardImage({ dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', x: 0, y: 0, w: 10, h: 10 }, limits)).toBe(null)

    expect(sanitizeBoardImageUpdate({ id: 'img-1', x: 5, y: 6, w: 7, h: 8 })).toEqual({
      id: 'img-1',
      x: 5,
      y: 6,
      w: 8,
      h: 8,
    })
    expect(sanitizeBoardImageUpdate({ id: '', x: 1, y: 2, w: 3, h: 4 })).toBe(null)
  })
})
