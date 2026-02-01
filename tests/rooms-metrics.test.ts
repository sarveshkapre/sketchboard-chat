import { describe, expect, it } from 'vitest'

import { snapshotRooms } from '../server/rooms-metrics.mjs'

describe('rooms metrics', () => {
  it('snapshots rooms with counts', () => {
    const rooms = new Map()
    rooms.set('b', { users: new Map([['u1', {}]]), strokes: [{}, {}], messages: [] })
    rooms.set('a', { users: new Map(), strokes: [], messages: [{}, {}, {}] })

    expect(snapshotRooms(rooms)).toEqual([
      { roomId: 'b', usersCount: 1, strokesCount: 2, messagesCount: 0 },
      { roomId: 'a', usersCount: 0, strokesCount: 0, messagesCount: 3 },
    ])
  })
})

