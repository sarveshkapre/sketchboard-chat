import { describe, expect, it, vi } from 'vitest'

import { addRecentRoom, readRecentRooms } from '../src/recentRooms'

describe('recent rooms', () => {
  it('stores and returns a deduped, normalized list', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })

    expect(addRecentRoom('Team 1', 3)).toEqual(['team-1'])
    expect(addRecentRoom('team-2', 3)).toEqual(['team-2', 'team-1'])
    expect(addRecentRoom('TEAM 1', 3)).toEqual(['team-1', 'team-2'])

    expect(readRecentRooms(3)).toEqual(['team-1', 'team-2'])
  })
})

