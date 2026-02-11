import { describe, expect, it } from 'vitest'

import { snapshotRooms } from '../server/rooms-metrics.mjs'

describe('rooms metrics', () => {
  it('snapshots rooms with counts and byte estimates', () => {
    const rooms = new Map()
    rooms.set('b', {
      users: new Map([['u1', {}]]),
      strokes: [{}, {}],
      images: [
        { dataUrl: 'data:image/png;base64,AAAA' },
        { dataUrl: 'data:image/png;base64,AAAAAA==' },
      ],
      messages: [],
      locked: true,
    })
    rooms.set('a', { users: new Map(), strokes: [], images: [], messages: [{}, {}, {}], locked: false })

    const result = snapshotRooms(rooms)
    expect(result).toHaveLength(2)

    expect(result[0]).toMatchObject({
      roomId: 'b',
      usersCount: 1,
      strokesCount: 2,
      imagesCount: 2,
      messagesCount: 0,
      locked: true,
      private: false,
    })
    expect(result[0].imagesBytes).toBeGreaterThan(0)
    expect(result[0].stateBytesEstimate).toBeGreaterThan(result[0].imagesBytes)

    expect(result[1]).toMatchObject({
      roomId: 'a',
      usersCount: 0,
      strokesCount: 0,
      imagesCount: 0,
      messagesCount: 3,
      locked: false,
      private: false,
    })
    expect(result[1].imagesBytes).toBe(0)
    expect(result[1].stateBytesEstimate).toBeGreaterThan(0)
  })

  it('includes users when requested', () => {
    const rooms = new Map()
    rooms.set('x', {
      users: new Map([
        ['u1', { id: 'u1', name: 'B', color: '#111', role: 'mod' }],
        ['u2', { id: 'u2', name: 'A', color: '#222', role: 'owner' }],
      ]),
      strokes: [],
      messages: [],
    })

    expect(snapshotRooms(rooms, { includeUsers: true })).toEqual([
      {
        roomId: 'x',
        usersCount: 2,
        strokesCount: 0,
        imagesCount: 0,
        imagesBytes: 0,
        messagesCount: 0,
        stateBytesEstimate: 4,
        locked: false,
        private: false,
        users: [
          { id: 'u2', name: 'A', color: '#222', role: 'owner' },
          { id: 'u1', name: 'B', color: '#111', role: 'mod' },
        ],
      },
    ])
  })
})
