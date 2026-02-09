import { describe, expect, it } from 'vitest'

import { createInviteToken, verifyInviteToken } from '../server/invite.mjs'

describe('invite tokens', () => {
  it('creates and verifies a token', () => {
    const secret = 's3cr3t'
    const token = createInviteToken({ roomId: 'team-1', expiresAtMs: Date.now() + 60_000, secret })
    expect(typeof token).toBe('string')

    const verified = verifyInviteToken({ token: token as string, roomId: 'team-1', secret, nowMs: Date.now() })
    expect(verified.ok).toBe(true)
  })

  it('rejects tokens for a different room or expired', () => {
    const secret = 's3cr3t'
    const exp = Date.now() + 5
    const token = createInviteToken({ roomId: 'room-a', expiresAtMs: exp, secret })
    expect(token).toBeTruthy()

    const wrongRoom = verifyInviteToken({ token: token as string, roomId: 'room-b', secret, nowMs: Date.now() })
    expect(wrongRoom.ok).toBe(false)

    const expired = verifyInviteToken({ token: token as string, roomId: 'room-a', secret, nowMs: exp + 1 })
    expect(expired.ok).toBe(false)
  })
})

