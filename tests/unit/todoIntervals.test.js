import { describe, it, expect } from 'vitest'
import { DAY } from '@/utils/time.js'
import {
  computeWeightedIntervalMs,
  updateTodoAverage,
  formatMs,
  getProgress,
} from '@/utils/todoIntervals.js'

describe('todoIntervals', () => {
  describe('formatMs', () => {
    it('returns null for invalid values', () => {
      expect(formatMs(Infinity)).toBeNull()
      expect(formatMs(0)).toBeNull()
      expect(formatMs(-100)).toBeNull()
    })

    it('formats largest readable unit only', () => {
      expect(formatMs(45_000)).toBe('45 sec')
      expect(formatMs(120_000)).toBe('2 min')
      expect(formatMs(7_200_000)).toBe('2h')
      expect(formatMs(2 * DAY)).toBe('2 j')
      expect(formatMs(14 * DAY)).toBe('2 sem')
      expect(formatMs(60 * DAY)).toBe('2 mois')
    })
  })

  describe('computeWeightedIntervalMs', () => {
    it('returns Infinity with fewer than two completed intervals', () => {
      expect(computeWeightedIntervalMs({ timings: [] })).toBe(Infinity)
      expect(computeWeightedIntervalMs({ timings: [{ end: 100 }] })).toBe(Infinity)
    })

    it('computes average interval from constant consumption rate', () => {
      const todo = {
        quantity: 1,
        unit: 'kg',
        timings: [
          { end: 0, quantity: 1, unit: 'kg' },
          { end: 10_000, quantity: 1, unit: 'kg' },
        ],
      }
      expect(computeWeightedIntervalMs(todo)).toBe(10_000)
    })

    it('weights intervals by purchased quantity (sum(time) / sum(qty))', () => {
      const todo = {
        quantity: 1,
        unit: 'kg',
        timings: [
          { end: 0, quantity: 500, unit: 'g' },
          { end: 5_000, quantity: 500, unit: 'g' },
          { end: 15_000, quantity: 1, unit: 'kg' },
        ],
      }
      // 5000 ms pour 0,5 kg + 10000 ms pour 0,5 kg → 15000 ms / 1 kg = 15 s/kg
      expect(computeWeightedIntervalMs(todo)).toBe(15_000)
    })

    it('scales interval linearly with selector quantity', () => {
      const base = {
        unit: 'L',
        timings: [
          { end: 0, quantity: 1, unit: 'L' },
          { end: 8 * DAY, quantity: 1, unit: 'L' },
        ],
      }
      expect(computeWeightedIntervalMs({ ...base, quantity: 1 })).toBe(8 * DAY)
      expect(computeWeightedIntervalMs({ ...base, quantity: 2 })).toBe(16 * DAY)
    })
  })

  describe('updateTodoAverage', () => {
    it('mutates todo.averageIntervalMs', () => {
      const todo = {
        quantity: 1,
        unit: '',
        timings: [
          { end: 0, quantity: 1, unit: '' },
          { end: 4_000, quantity: 1, unit: '' },
        ],
      }
      updateTodoAverage(todo)
      expect(todo.averageIntervalMs).toBe(4_000)
    })
  })

  describe('getProgress', () => {
    it('returns 1 for unchecked todos', () => {
      expect(getProgress({ done: false }, Date.now())).toBe(1)
    })

    it('returns 0 when stock data is missing', () => {
      expect(getProgress({ done: true, timings: [], averageIntervalMs: 1000 }, 5000)).toBe(0)
    })

    it('computes progress from elapsed time since last purchase', () => {
      const todo = {
        done: true,
        averageIntervalMs: 10_000,
        timings: [{ end: 1_000 }],
      }
      expect(getProgress(todo, 7_000)).toBeCloseTo(0.1)
      expect(getProgress(todo, 1_000)).toBe(0)
    })
  })
})
