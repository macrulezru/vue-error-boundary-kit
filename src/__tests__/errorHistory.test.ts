import { describe, expect, it } from 'vitest'
import { createErrorHistory } from '../errorHistory'
import type { CapturedError } from '../types'

function makeError(message: string): CapturedError {
  return { error: new Error(message), message, source: 'render', timestamp: Date.now() }
}

describe('createErrorHistory', () => {
  it('records errors reported via .record, most recent first', () => {
    const history = createErrorHistory()

    history.record.report(makeError('first'))
    history.record.report(makeError('second'))

    expect(history.entries.value.map((e) => e.message)).toEqual(['second', 'first'])
  })

  it('assigns each entry a stable, unique id', () => {
    const history = createErrorHistory()
    history.record.report(makeError('a'))
    history.record.report(makeError('b'))

    const ids = history.entries.value.map((e) => e.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('evicts the oldest entry once the limit is exceeded', () => {
    const history = createErrorHistory({ limit: 2 })

    history.record.report(makeError('a'))
    history.record.report(makeError('b'))
    history.record.report(makeError('c'))

    expect(history.entries.value.map((e) => e.message)).toEqual(['c', 'b'])
  })

  it('clear() empties the history', () => {
    const history = createErrorHistory()
    history.record.report(makeError('a'))
    expect(history.entries.value).toHaveLength(1)

    history.clear()
    expect(history.entries.value).toHaveLength(0)
  })

  it('defaults the limit to 50', () => {
    const history = createErrorHistory()
    for (let i = 0; i < 55; i++) history.record.report(makeError(`e${i}`))
    expect(history.entries.value).toHaveLength(50)
    expect(history.entries.value[0]?.message).toBe('e54')
  })

  it('two independent histories do not share state (no module-level counters)', () => {
    const a = createErrorHistory()
    const b = createErrorHistory()

    a.record.report(makeError('a1'))
    b.record.report(makeError('b1'))

    expect(a.entries.value).toHaveLength(1)
    expect(b.entries.value).toHaveLength(1)
  })
})
