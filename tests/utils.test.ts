import { describe, expect, it } from 'vitest'

import { createId, formatBytes, formatTime } from '../src/utils'

describe('utils', () => {
  it('creates ids with prefix', () => {
    const value = createId('unit')
    expect(value.startsWith('unit-')).toBe(true)
  })

  it('formats time', () => {
    const value = formatTime('2026-02-01T10:15:00.000Z')
    expect(value.length).toBeGreaterThan(0)
  })

  it('formats byte values', () => {
    expect(formatBytes(999)).toBe('999B')
    expect(formatBytes(2048)).toBe('2.0KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0MB')
  })
})
