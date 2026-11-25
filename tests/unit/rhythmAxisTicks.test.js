import { describe, expect, it } from 'vitest'
import { pickRhythmXTicks } from '@/utils/stats/rhythmAxisTicks.js'

describe('pickRhythmXTicks', () => {
  it('returns visible point indices in range', () => {
    const points = [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]
    expect(pickRhythmXTicks(points, 0.5, 2.5, 6)).toEqual([1, 2])
  })

  it('keeps every index when there are few enough', () => {
    const points = [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]
    expect(pickRhythmXTicks(points, -1, 5, 6)).toEqual([0, 1, 2])
  })

  it('includes the tallest point among a long series', () => {
    const points = Array.from({ length: 12 }, (_, i) => ({
      x: i,
      y: i === 7 ? 50 : 1,
    }))
    const ticks = pickRhythmXTicks(points, -0.5, 11.5, 5)
    expect(ticks).toContain(0)
    expect(ticks).toContain(11)
    expect(ticks).toContain(7)
    expect(ticks.length).toBeLessThanOrEqual(5)
  })
})
