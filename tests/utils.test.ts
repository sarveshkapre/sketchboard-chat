import { describe, expect, it } from 'vitest'

import { createId, formatTime } from '../src/utils'

describe('utils', () => {
  it('creates ids with prefix', () => {
    const value = createId('unit')
    expect(value.startsWith('unit-')).toBe(true)
  })

  it('formats time', () => {
    const value = formatTime('2026-02-01T10:15:00.000Z')
    expect(value.length).toBeGreaterThan(0)
  })
})
