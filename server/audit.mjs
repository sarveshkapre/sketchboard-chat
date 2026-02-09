import { createId } from './validation.mjs'

export const MAX_AUDIT_EVENTS = 40

function normalizeName(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return fallback
}

function formatAuditText({ kind, actorName, targetName, role }) {
  const actor = normalizeName(actorName, 'System')
  const target = normalizeName(targetName, 'a user')

  if (kind === 'lock') return `${actor} locked the room.`
  if (kind === 'unlock') return `${actor} unlocked the room.`
  if (kind === 'privacy') {
    if (role === 'private') return `${actor} made the room invite-only.`
    return `${actor} made the room public.`
  }
  if (kind === 'kick') return `${actor} removed ${target} from the room.`
  if (kind === 'role') {
    if (role === 'mod') return `${actor} made ${target} a moderator.`
    return `${actor} removed moderator role from ${target}.`
  }
  if (kind === 'owner') return `${target} is now the room owner.`
  if (kind === 'invite') {
    if (role === 'revoked') return `${actor} revoked invite links.`
    if (role === 'regenerated') return `${actor} regenerated the invite link.`
    return `${actor} created an invite link.`
  }
  return `${actor} updated the room.`
}

export function createAuditEntry({ kind, actor, target, role } = {}) {
  const actorName = normalizeName(actor?.name, 'System')
  const targetName = normalizeName(target?.name, 'a user')

  return {
    id: createId('audit'),
    at: new Date().toISOString(),
    kind,
    actorId: actor?.id ?? null,
    actorName,
    targetId: target?.id ?? null,
    targetName,
    role: role ?? null,
    text: formatAuditText({ kind, actorName, targetName, role }),
  }
}

export function appendAuditEvent(room, entry) {
  if (!room) return []
  const next = Array.isArray(room.audit) ? room.audit.slice() : []
  next.push(entry)
  if (next.length > MAX_AUDIT_EVENTS) {
    next.splice(0, next.length - MAX_AUDIT_EVENTS)
  }
  room.audit = next
  return next
}
