import { describe, expect, it } from 'vitest'

import { appendAuditEvent, createAuditEntry, MAX_AUDIT_EVENTS } from '../server/audit.mjs'

describe('audit', () => {
  it('creates readable audit entries', () => {
    const entry = createAuditEntry({
      kind: 'lock',
      actor: { id: 'u1', name: 'Avery' },
    })
    expect(entry.text).toContain('Avery')
    expect(entry.text).toContain('locked')
  })

  it('caps audit entries to the max', () => {
    const room = { audit: [] }
    for (let i = 0; i < MAX_AUDIT_EVENTS + 5; i += 1) {
      appendAuditEvent(
        room,
        createAuditEntry({ kind: 'lock', actor: { id: `u${i}`, name: 'Auto' } }),
      )
    }
    expect(room.audit).toHaveLength(MAX_AUDIT_EVENTS)
  })
})
