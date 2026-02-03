export const ROLE_OWNER = 'owner'
export const ROLE_MOD = 'mod'
export const ROLE_MEMBER = 'member'

export function canModerate(role) {
  return role === ROLE_OWNER || role === ROLE_MOD
}

export function getRole(room, userId) {
  return room.roles.get(userId) ?? ROLE_MEMBER
}

export function assignOwner(room, user) {
  if (!user) return
  room.ownerId = user.id
  room.roles.set(user.id, ROLE_OWNER)
  user.role = ROLE_OWNER
}

export function setRole(room, userId, role) {
  if (role === ROLE_OWNER) return false
  room.roles.set(userId, role)
  return true
}

export function clearRole(room, userId) {
  room.roles.delete(userId)
  if (room.ownerId === userId) {
    room.ownerId = null
  }
}

export function ensureOwner(room) {
  if (room.ownerId && room.users.has(room.ownerId)) {
    const owner = room.users.get(room.ownerId)
    if (owner && !owner.viewOnly) {
      room.roles.set(room.ownerId, ROLE_OWNER)
      owner.role = ROLE_OWNER
      return room.ownerId
    }
  }

  const previousOwnerId = room.ownerId
  if (previousOwnerId && room.users.has(previousOwnerId)) {
    const previousOwner = room.users.get(previousOwnerId)
    if (previousOwner) {
      room.roles.set(previousOwnerId, ROLE_MEMBER)
      previousOwner.role = ROLE_MEMBER
    }
  }

  const candidate = Array.from(room.users.values()).find((user) => !user.viewOnly)
  if (!candidate) {
    room.ownerId = null
    return null
  }
  assignOwner(room, candidate)
  return candidate.id
}

