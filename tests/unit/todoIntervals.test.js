import { describe, it, expect } from 'vitest'
import { DAY } from '@/utils/time.js'
import {
  computeWeightedIntervalMs,
  computeIntervalStats,
  updateTodoAverage,
  formatMs,
  getProgress,
} from '@/utils/todo/todoIntervals.js'

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

  describe('computeIntervalStats', () => {
    const withTimings = (timings, quantity = 1) => ({ quantity, unit: '', timings })

    it('returns no deviation below two usable intervals', () => {
      expect(computeIntervalStats(withTimings([])).stdDevMs).toBeNull()
      expect(
        computeIntervalStats(withTimings([
          { end: 0, quantity: 1, unit: '' },
          { end: 10_000, quantity: 1, unit: '' },
        ])).stdDevMs,
      ).toBeNull()
    })

    it('returns zero deviation for a perfectly regular rhythm', () => {
      const stats = computeIntervalStats(withTimings([
        { end: 0, quantity: 1, unit: '' },
        { end: 10_000, quantity: 1, unit: '' },
        { end: 20_000, quantity: 1, unit: '' },
      ]))
      expect(stats.averageMs).toBe(10_000)
      expect(stats.stdDevMs).toBe(0)
    })

    it('measures the spread of irregular intervals', () => {
      const stats = computeIntervalStats(withTimings([
        { end: 0, quantity: 1, unit: '' },
        { end: 10_000, quantity: 1, unit: '' },
        { end: 30_000, quantity: 1, unit: '' },
      ]))
      expect(stats.averageMs).toBe(15_000)
      expect(stats.stdDevMs).toBe(5_000)
    })

    it('weights the deviation by purchased quantity', () => {
      const stats = computeIntervalStats(withTimings([
        { end: 0, quantity: 2, unit: '' },
        { end: 10_000, quantity: 1, unit: '' },
        { end: 20_000, quantity: 1, unit: '' },
      ]))
      // taux 5000 ms/u (poids 2) et 10000 ms/u (poids 1) → moyenne 6666,67, σ = √(50/9 M)
      expect(stats.averageMs).toBeCloseTo(6_666.67, 2)
      expect(stats.stdDevMs).toBeCloseTo(2_357.02, 2)
    })

    it('scales the deviation with the selector quantity', () => {
      const timings = [
        { end: 0, quantity: 1, unit: '' },
        { end: 10_000, quantity: 1, unit: '' },
        { end: 30_000, quantity: 1, unit: '' },
      ]
      expect(computeIntervalStats(withTimings(timings, 1)).stdDevMs).toBe(5_000)
      expect(computeIntervalStats(withTimings(timings, 2)).stdDevMs).toBe(10_000)
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
      expect(todo.intervalStdDevMs).toBeNull()
    })

    it('mutates todo.intervalStdDevMs once the rhythm is measurable', () => {
      const todo = {
        quantity: 1,
        unit: '',
        timings: [
          { end: 0, quantity: 1, unit: '' },
          { end: 4_000, quantity: 1, unit: '' },
          { end: 12_000, quantity: 1, unit: '' },
        ],
      }
      updateTodoAverage(todo)
      expect(todo.averageIntervalMs).toBe(6_000)
      expect(todo.intervalStdDevMs).toBe(2_000)
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
      expect(getProgress(todo, 7_000)).toBeCloseTo(0.6)
      expect(getProgress(todo, 1_000)).toBe(0)
    })

    it('reaches 1 exactly when the average interval has elapsed', () => {
      const todo = {
        done: true,
        averageIntervalMs: 10_000,
        timings: [{ end: 1_000 }],
      }
      expect(getProgress(todo, 11_000)).toBe(1)
    })

    it('keeps growing beyond 1 when the stock is overdue', () => {
      const todo = {
        done: true,
        averageIntervalMs: 10_000,
        timings: [{ end: 1_000 }],
      }
      expect(getProgress(todo, 16_000)).toBeCloseTo(1.5)
    })
  })
})
