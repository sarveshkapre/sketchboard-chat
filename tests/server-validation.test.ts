import { describe, expect, it } from 'vitest'

import {
  parseCorsOrigin,
  sanitizeChatMessage,
  sanitizeCursor,
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
})
