import { describe, expect, it } from 'vitest'

import { snapshotRooms } from '../server/rooms-metrics.mjs'

describe('rooms metrics', () => {
  it('snapshots rooms with counts', () => {
    const rooms = new Map()
    rooms.set('b', { users: new Map([['u1', {}]]), strokes: [{}, {}], messages: [], locked: true })
    rooms.set('a', { users: new Map(), strokes: [], messages: [{}, {}, {}], locked: false })

    expect(snapshotRooms(rooms)).toEqual([
      { roomId: 'b', usersCount: 1, strokesCount: 2, messagesCount: 0, locked: true },
      { roomId: 'a', usersCount: 0, strokesCount: 0, messagesCount: 3, locked: false },
    ])
  })

  it('includes users when requested', () => {
    const rooms = new Map()
    rooms.set('x', {
      users: new Map([
        ['u1', { id: 'u1', name: 'B', color: '#111' }],
        ['u2', { id: 'u2', name: 'A', color: '#222' }],
      ]),
      strokes: [],
      messages: [],
    })

    expect(snapshotRooms(rooms, { includeUsers: true })).toEqual([
      {
        roomId: 'x',
        usersCount: 2,
        strokesCount: 0,
        messagesCount: 0,
        locked: false,
        users: [
          { id: 'u2', name: 'A', color: '#222' },
          { id: 'u1', name: 'B', color: '#111' },
        ],
      },
    ])
  })
})
