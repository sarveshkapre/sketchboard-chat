import { describe, expect, it } from 'vitest'

import {
  assignOwner,
  canModerate,
  clearRole,
  ensureOwner,
  getRole,
  setRole,
} from '../server/roles.mjs'

describe('roles', () => {
  it('assigns and ensures owners', () => {
    const room = {
      users: new Map(),
      roles: new Map(),
      ownerId: null,
    }

    const user = { id: 'u1', viewOnly: false, role: 'member' }
    room.users.set(user.id, user)

    assignOwner(room, user)
    expect(room.ownerId).toBe('u1')
    expect(getRole(room, 'u1')).toBe('owner')

    room.ownerId = null
    ensureOwner(room)
    expect(room.ownerId).toBe('u1')
  })

  it('demotes previous owner if needed', () => {
    const room = {
      users: new Map(),
      roles: new Map(),
      ownerId: 'u1',
    }
    const u1 = { id: 'u1', viewOnly: true, role: 'owner' }
    const u2 = { id: 'u2', viewOnly: false, role: 'member' }
    room.users.set('u1', u1)
    room.users.set('u2', u2)
    room.roles.set('u1', 'owner')

    ensureOwner(room)
    expect(room.ownerId).toBe('u2')
    expect(room.roles.get('u1')).toBe('member')
  })

  it('supports moderation helpers', () => {
    const room = { users: new Map(), roles: new Map(), ownerId: null }
    expect(canModerate('owner')).toBe(true)
    expect(canModerate('mod')).toBe(true)
    expect(canModerate('member')).toBe(false)

    setRole(room, 'u1', 'mod')
    expect(getRole(room, 'u1')).toBe('mod')
    clearRole(room, 'u1')
    expect(getRole(room, 'u1')).toBe('member')
  })
})

