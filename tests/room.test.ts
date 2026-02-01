import { describe, expect, it } from 'vitest'

import { buildRoomUrl, getRoomIdFromUrl, normalizeRoomId } from '../src/room'

describe('room', () => {
  it('normalizes room ids', () => {
    expect(normalizeRoomId(undefined)).toBe('main')
    expect(normalizeRoomId('  Team-1 ')).toBe('team-1')
    expect(normalizeRoomId('../weird room??')).toBe('weird-room')
  })

  it('reads room id from url', () => {
    expect(getRoomIdFromUrl('http://localhost:5173')).toBe('main')
    expect(getRoomIdFromUrl('http://localhost:5173/?room=abc')).toBe('abc')
    expect(getRoomIdFromUrl('http://localhost:5173/r/Space')).toBe('space')
  })

  it('builds a room url', () => {
    const url = buildRoomUrl('http://localhost:5173/?room=old', 'new room')
    expect(url).toBe('http://localhost:5173/r/new-room')

    const mainUrl = buildRoomUrl('http://localhost:5173/r/other', 'main')
    expect(mainUrl).toBe('http://localhost:5173/')
  })
})
