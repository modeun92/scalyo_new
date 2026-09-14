// HEALTH-SCALE parity guard.
//
// The scale exists in three files now (see src/domain/health.ts). This test reads the
// other two as TEXT and fails if their numbers drift from ours. It is deliberately a
// regex over the source rather than an import: lib/health.js is a Vue-app module and
// context.service.js imports Pages Functions config, neither of which loads cleanly in a
// Worker test context — but both state their thresholds as literals we can read.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HEALTH_MAX, HEALTH_THRESHOLDS, healthStatus, toHealthNumber, clientArr, daysUntil } from '../src/domain/health'

const here = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(here, '../../frontend')

function read(relativePath: string): string {
  return readFileSync(resolve(FRONTEND, relativePath), 'utf8')
}

describe('health scale parity across the three mirrors', () => {
  it('matches src/lib/health.js (canonical)', () => {
    const source = read('src/lib/health.js')
    const max = /HEALTH_MAX\s*=\s*(\d+)/.exec(source)
    const thresholds = /HEALTH_THRESHOLDS\s*=\s*Object\.freeze\(\{\s*critical:\s*(\d+)\s*,\s*watch:\s*(\d+)/.exec(source)

    expect(max, 'HEALTH_MAX not found in lib/health.js — did it move?').toBeTruthy()
    expect(thresholds, 'HEALTH_THRESHOLDS not found in lib/health.js — did it move?').toBeTruthy()

    expect(Number(max![1])).toBe(HEALTH_MAX)
    expect(Number(thresholds![1])).toBe(HEALTH_THRESHOLDS.critical)
    expect(Number(thresholds![2])).toBe(HEALTH_THRESHOLDS.watch)
  })

  it('matches functions/api/_services/context.service.js (AI context mirror)', () => {
    const source = read('functions/api/_services/context.service.js')
    const max = /HEALTH_MAX\s*=\s*(\d+)/.exec(source)
    const thresholds = /HEALTH_THRESHOLDS\s*=\s*\{\s*critical:\s*(\d+)\s*,\s*watch:\s*(\d+)/.exec(source)

    expect(max).toBeTruthy()
    expect(thresholds).toBeTruthy()

    expect(Number(max![1])).toBe(HEALTH_MAX)
    expect(Number(thresholds![1])).toBe(HEALTH_THRESHOLDS.critical)
    expect(Number(thresholds![2])).toBe(HEALTH_THRESHOLDS.watch)
  })
})

describe('healthStatus — worst of the two wins', () => {
  it('derives critical from the score alone', () => {
    expect(healthStatus(3, null)).toBe('critical')
    expect(healthStatus(2, 'healthy')).toBe('critical')
  })

  it('lets the entered status only worsen the derived one', () => {
    expect(healthStatus(9, 'critical')).toBe('critical')
    expect(healthStatus(9, 'watch')).toBe('watch')
    expect(healthStatus(9, null)).toBe('healthy')
  })

  it('does not coerce a missing score to 0', () => {
    // The bug this replaced: `null <= 3` is true in JS, so an unscored account read as critical.
    expect(healthStatus(null, null)).toBe('healthy')
    expect(healthStatus('', null)).toBe('healthy')
  })

  it('treats a real 0 as critical, not as missing (R21)', () => {
    expect(toHealthNumber(0)).toBe(0)
    expect(healthStatus(0, null)).toBe('critical')
  })
})

describe('clientArr — R21, a missing amount is null, never 0', () => {
  it('prefers arr', () => expect(clientArr({ arr: 120000, mrr: 500 })).toBe(120000))
  it('falls back to mrr * 12', () => expect(clientArr({ mrr: 1000 })).toBe(12000))
  it('returns null when neither is set', () => expect(clientArr({})).toBeNull())
  it('keeps a real zero', () => expect(clientArr({ arr: 0 })).toBe(0))
})

describe('daysUntil — calendar days, not instants', () => {
  const reference = new Date('2026-09-14T23:00:00Z')
  it('reports today as 0 even late in the day', () => expect(daysUntil('2026-09-14', reference)).toBe(0))
  it('reports a past date as negative', () => expect(daysUntil('2026-05-04', reference)).toBeLessThan(0))
  it('returns null for absent or unparseable input', () => {
    expect(daysUntil(null, reference)).toBeNull()
    expect(daysUntil('not-a-date', reference)).toBeNull()
  })
})
