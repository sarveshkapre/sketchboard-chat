import { describe, expect, it, vi } from 'vitest'

import { fetchRoomsMetrics } from '../src/adminRooms'

describe('admin rooms api', () => {
  it('fetches rooms metrics', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rooms: [{ roomId: 'a', usersCount: 1, strokesCount: 2, messagesCount: 3 }] }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const rooms = await fetchRoomsMetrics()
    expect(rooms).toEqual([{ roomId: 'a', usersCount: 1, strokesCount: 2, messagesCount: 3 }])
  })
})

