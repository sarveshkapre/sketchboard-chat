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
      rolesByKey: new Map(),
      ownerKey: null,
    }

    const user = { id: 's1', userKey: 'u1', viewOnly: false, role: 'member' }
    room.users.set(user.id, user)

    assignOwner(room, user)
    expect(room.ownerKey).toBe('u1')
    expect(getRole(room, 'u1')).toBe('owner')

    room.ownerKey = null
    ensureOwner(room)
    expect(room.ownerKey).toBe('u1')
  })

  it('demotes previous owner if needed', () => {
    const room = {
      users: new Map(),
      rolesByKey: new Map(),
      ownerKey: 'u1',
    }
    const u1 = { id: 's1', userKey: 'u1', viewOnly: true, role: 'owner' }
    const u2 = { id: 's2', userKey: 'u2', viewOnly: false, role: 'member' }
    room.users.set('s1', u1)
    room.users.set('s2', u2)
    room.rolesByKey.set('u1', 'owner')

    ensureOwner(room)
    expect(room.ownerKey).toBe('u2')
    expect(room.rolesByKey.get('u1')).toBeUndefined()
  })

  it('supports moderation helpers', () => {
    const room = { users: new Map(), rolesByKey: new Map(), ownerKey: null }
    expect(canModerate('owner')).toBe(true)
    expect(canModerate('mod')).toBe(true)
    expect(canModerate('member')).toBe(false)

    setRole(room, 'u1', 'mod')
    expect(getRole(room, 'u1')).toBe('mod')
    clearRole(room, 'u1')
    expect(getRole(room, 'u1')).toBe('member')
  })
})
