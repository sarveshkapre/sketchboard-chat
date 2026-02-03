export const ROLE_OWNER = 'owner'
export const ROLE_MOD = 'mod'
export const ROLE_MEMBER = 'member'

export function canModerate(role) {
  return role === ROLE_OWNER || role === ROLE_MOD
}

function updateUsersForKey(room, userKey, role) {
  if (!room?.users) return
  for (const user of room.users.values()) {
    if (user?.userKey === userKey) {
      user.role = role
    }
  }
}

export function getRole(room, userKey) {
  return room.rolesByKey.get(userKey) ?? ROLE_MEMBER
}

export function assignOwner(room, user) {
  if (!user) return
  room.ownerKey = user.userKey
  room.rolesByKey.set(user.userKey, ROLE_OWNER)
  updateUsersForKey(room, user.userKey, ROLE_OWNER)
}

export function setRole(room, userKey, role) {
  if (role === ROLE_OWNER) return false
  if (role === ROLE_MEMBER) {
    room.rolesByKey.delete(userKey)
  } else {
    room.rolesByKey.set(userKey, role)
  }
  updateUsersForKey(room, userKey, role)
  return true
}

export function clearRole(room, userKey) {
  room.rolesByKey.delete(userKey)
  updateUsersForKey(room, userKey, ROLE_MEMBER)
  if (room.ownerKey === userKey) {
    room.ownerKey = null
  }
}

export function ensureOwner(room) {
  if (room.ownerKey) {
    const owner = Array.from(room.users.values()).find(
      (user) => user.userKey === room.ownerKey && !user.viewOnly,
    )
    if (owner) {
      room.rolesByKey.set(room.ownerKey, ROLE_OWNER)
      updateUsersForKey(room, room.ownerKey, ROLE_OWNER)
      return room.ownerKey
    }
  }

  const previousOwnerKey = room.ownerKey
  if (previousOwnerKey) {
    room.rolesByKey.delete(previousOwnerKey)
  }

  const candidate = Array.from(room.users.values()).find((user) => !user.viewOnly)
  if (!candidate) {
    room.ownerKey = null
    return null
  }
  assignOwner(room, candidate)
  return candidate.userKey
}
