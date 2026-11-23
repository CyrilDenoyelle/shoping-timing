import { describe, it, expect } from 'vitest'
import { DAY } from '@/utils/time.js'
import {
  computeWeightedIntervalMs,
  computeIntervalStats,
  analyzeIntervals,
  updateTodoAverage,
  weightedMedian,
  formatMs,
  getProgress,
} from '@/utils/todo/todoIntervals.js'

// intervals[i] = durée (ms) entre l'achat i et l'achat i+1 ; quantities[i] = quantité de l'achat i
const buildTimings = (intervals, quantities = []) => {
  let end = 0
  const timings = [{ end, quantity: quantities[0] ?? 1, unit: '' }]
  intervals.forEach((ms, i) => {
    end += ms
    timings.push({ end, quantity: quantities[i + 1] ?? 1, unit: '' })
  })
  return timings
}

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

  describe('weightedMedian', () => {
    it('returns the only value', () => {
      expect(weightedMedian([5], [1])).toBe(5)
    })

    it('returns the middle value with equal weights, whatever the input order', () => {
      expect(weightedMedian([1, 2, 3], [1, 1, 1])).toBe(2)
      expect(weightedMedian([30, 1, 1], [1, 1, 1])).toBe(1)
    })

    it('follows the weights', () => {
      // poids cumulé 3 ≥ 4/2 dès la première valeur
      expect(weightedMedian([1, 2], [3, 1])).toBe(1)
      expect(weightedMedian([1, 2], [1, 3])).toBe(2)
    })

    it('returns the lower median when the half weight falls exactly between two values', () => {
      expect(weightedMedian([1, 2], [1, 1])).toBe(1)
    })
  })

  describe('adaptive outlier filtering', () => {
    const stats = (intervals, quantities) =>
      computeIntervalStats({ quantity: 1, unit: '', timings: buildTimings(intervals, quantities) })

    it('exposes empty counters when nothing is measurable', () => {
      const result = computeIntervalStats({ quantity: 1, unit: '', timings: [] })
      expect(result.usedCount).toBe(0)
      expect(result.totalCount).toBe(0)
    })

    it('ignores a timing without end date', () => {
      const result = computeIntervalStats({
        quantity: 1,
        unit: '',
        timings: [{ end: 0 }, { end: 10_000 }, { start: 20_000 }],
      })
      expect(result.averageMs).toBe(10_000)
      expect(result.stdDevMs).toBeNull()
      expect(result.usedCount).toBe(1)
    })

    it('keeps every interval below 3 samples', () => {
      // 1 j et 100 j : aucune médiane fiable → tout est conservé
      // moyenne = (1 + 100) / 2 = 50,5 j
      const result = stats([1 * DAY, 100 * DAY])
      expect(result.usedCount).toBe(2)
      expect(result.totalCount).toBe(2)
      expect(result.averageMs).toBeCloseTo(50.5 * DAY, 3)
    })

    it('drops the 30-week off-season gap of a seasonal product', () => {
      // 16 intervalles de 7 j + 1 pause de 210 j (30 semaines), tous de quantité 1
      // sans filtre : (16×7 + 210) / 17 = 18,94 j ; avec filtre : médiane 7 j, MAD 0
      // → écart robuste plancher ln 1,5 → limite 3×0,405 = 1,216 ; ln(210/7) = 3,40 > 1,216 → exclu
      // 16 restants > 6 → on garde max(6, ⌈32/3⌉ = 11) = 11 intervalles de 7 j
      const result = stats([...Array(16).fill(7 * DAY), 210 * DAY])
      expect(result.totalCount).toBe(17)
      expect(result.usedCount).toBe(11)
      expect(result.averageMs).toBe(7 * DAY)
      expect(result.stdDevMs).toBe(0)
    })

    it('drops a very short interval as well', () => {
      // 4 intervalles de 10 j + 1 de 1 j : médiane 10 j, MAD 0 → limite 1,216
      // ln(1/10) = −2,30 → |2,30| > 1,216 → exclu ; moyenne des 4 restants = 10 j
      const result = stats([10 * DAY, 10 * DAY, 10 * DAY, 10 * DAY, 1 * DAY])
      expect(result.totalCount).toBe(5)
      expect(result.usedCount).toBe(4)
      expect(result.averageMs).toBe(10 * DAY)
      expect(result.stdDevMs).toBe(0)
    })

    it('widens the threshold for an irregular product', () => {
      // 1, 2, 4, 8, 16 j : médiane 4 j ; distances ln = 1,386 / 0,693 / 0 / 0,693 / 1,386
      // MAD = 0,693 → écart robuste 1,4826×0,693 = 1,028 → limite 3,08 > 1,386 → rien d'exclu
      // moyenne = 31/5 = 6,2 j ; variance = (27,04+17,64+4,84+3,24+96,04)/5 = 29,76
      const result = stats([1, 2, 4, 8, 16].map((d) => d * DAY))
      expect(result.usedCount).toBe(5)
      expect(result.averageMs).toBeCloseTo(6.2 * DAY, 3)
      expect(result.stdDevMs).toBeCloseTo(Math.sqrt(29.76) * DAY, 3)
    })

    it('weights the median by purchased quantity', () => {
      // A : 3 u en 3 j (1 j/u, poids 3) ; B : 1 u en 2 j (2 j/u) ; C : 1 u en 40 j (40 j/u)
      // médiane pondérée = 1 j/u (poids 3 ≥ 5/2) ; MAD pondéré = 0 → limite 1,216
      // B : ln 2 = 0,69 → gardé ; C : ln 40 = 3,69 → exclu
      // moyenne = (3 + 2) / (3 + 1) = 1,25 j/u ; variance = (3×0,0625 + 1×0,5625)/4 = 0,1875
      // (médiane non pondérée = 2 j/u → limite 3,08 > ln 20 = 3,00 → C serait gardé, moyenne 9 j/u)
      const result = stats([3 * DAY, 2 * DAY, 40 * DAY], [3, 1, 1, 1])
      expect(result.totalCount).toBe(3)
      expect(result.usedCount).toBe(2)
      expect(result.averageMs).toBeCloseTo(1.25 * DAY, 3)
      expect(result.stdDevMs).toBeCloseTo(Math.sqrt(0.1875) * DAY, 3)
    })

    it('always keeps at least two intervals', () => {
      // A : 10 u en 10 000 ms (1 000 ms/u, poids 10) ; B : 1 u en 100 000 ms ; C : 1 u en 20 ms
      // médiane pondérée = 1 000 ; MAD = 0 → limite 1,216 : B (4,61) et C (3,91) exclus → 1 seul reste
      // garde : on conserve les 2 plus proches de la médiane → A et C
      // moyenne = (10 000 + 20) / 11 ; variance = (10×1/121) × 980² = 9 604 000 / 121
      const result = stats([10_000, 100_000, 20], [10, 1, 1, 1])
      expect(result.totalCount).toBe(3)
      expect(result.usedCount).toBe(2)
      expect(result.averageMs).toBeCloseTo(10_020 / 11, 6)
      expect(result.stdDevMs).toBeCloseTo(Math.sqrt(9_604_000 / 121), 6)
    })

    it('keeps all intervals up to 6 samples', () => {
      // 1..6 j : médiane 3 j, MAD 0,405 → limite 1,80 ≥ ln 3 = 1,10 → rien d'exclu ; 6 ≤ 6 → tout gardé
      // moyenne = 21/6 = 3,5 j
      const result = stats([1, 2, 3, 4, 5, 6].map((d) => d * DAY))
      expect(result.usedCount).toBe(6)
      expect(result.averageMs).toBeCloseTo(3.5 * DAY, 3)
    })

    it('starts trimming with the 7th interval', () => {
      // 1..7 j : rien d'exclu par le seuil ; 7 > 6 → max(6, ⌈14/3⌉ = 5) = 6 gardés
      // médiane 4 j : le plus éloigné est 1 j (ln 4 = 1,39) → gardés 2..7 j
      // moyenne = 27/6 = 4,5 j ; variance = 17,5/6
      const result = stats([1, 2, 3, 4, 5, 6, 7].map((d) => d * DAY))
      expect(result.totalCount).toBe(7)
      expect(result.usedCount).toBe(6)
      expect(result.averageMs).toBeCloseTo(4.5 * DAY, 3)
      expect(result.stdDevMs).toBeCloseTo(Math.sqrt(17.5 / 6) * DAY, 3)
    })

    it('keeps the 2/3 closest to the median beyond 6 samples', () => {
      // 1..10 j : médiane 5 j ; MAD = 0,47 → limite 2,09 > ln 5 = 1,61 → rien d'exclu par le seuil
      // 10 > 6 → max(6, ⌈20/3⌉ = 7) = 7 gardés : les plus proches de 5 j en distance log
      // distances : 5→0 ; 6→0,18 ; 4→0,22 ; 7→0,34 ; 8→0,47 ; 3→0,51 ; 9→0,59 ; (10→0,69 ; 2→0,92 ; 1→1,61)
      // gardés 3..9 j : moyenne = 42/7 = 6 j ; variance = (9+4+1+0+1+4+9)/7 = 4 → σ = 2 j
      const result = stats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => d * DAY))
      expect(result.totalCount).toBe(10)
      expect(result.usedCount).toBe(7)
      expect(result.averageMs).toBeCloseTo(6 * DAY, 3)
      expect(result.stdDevMs).toBeCloseTo(2 * DAY, 3)
    })
  })

  describe('analyzeIntervals', () => {
    const analyze = (intervals, quantities, quantity = 1) =>
      analyzeIntervals({ quantity, unit: '', timings: buildTimings(intervals, quantities) })

    it('returns no sample for a product without measurable interval', () => {
      const analysis = analyzeIntervals({ quantity: 1, unit: '', timings: [{ end: 0 }] })
      expect(analysis.samples).toEqual([])
      expect(analysis.stats.usedCount).toBe(0)
      expect(analysis.medianMs).toBeNull()
    })

    it('describes each interval with its dates, weight and rate', () => {
      // A : 2 u de 0 à 10 000 → 5 000 ms/u ; B : 1 u de 10 000 à 30 000 → 20 000 ms/u
      const analysis = analyze([10_000, 20_000], [2, 1, 1])
      expect(analysis.samples).toEqual([
        { from: 0, at: 10_000, interval: 10_000, qty: 2, rate: 5_000, scaledMs: 5_000, used: true, exclusion: null },
        { from: 10_000, at: 30_000, interval: 20_000, qty: 1, rate: 20_000, scaledMs: 20_000, used: true, exclusion: null },
      ])
    })

    it('scales every value to the selector quantity', () => {
      // sélecteur 2 : une durée pour 2 unités = 2 × le taux ; 3 intervalles → plage tolérée définie
      const analysis = analyze([4 * DAY, 4 * DAY, 4 * DAY], [], 2)
      expect(analysis.scale).toBe(2)
      expect(analysis.samples.map((s) => s.scaledMs)).toEqual([8 * DAY, 8 * DAY, 8 * DAY])
      expect(analysis.medianMs).toBe(8 * DAY)
      expect(analysis.stats.averageMs).toBe(8 * DAY)
    })

    it('exposes no tolerated range below 3 intervals', () => {
      const analysis = analyze([1 * DAY, 100 * DAY])
      expect(analysis.medianMs).toBeNull()
      expect(analysis.lowerMs).toBeNull()
      expect(analysis.upperMs).toBeNull()
      expect(analysis.samples.every((s) => s.used && s.exclusion === null)).toBe(true)
    })

    it('flags the off-season gap as too long and the oldest regular intervals as trimmed', () => {
      // 16 × 7 j + 210 j : médiane 7 j, plage = 7 j × / ÷ 1,5³ (= 3,375)
      // borne haute = 23,625 j ; borne basse = 7 / 3,375 = 2,074 j
      // pause (indice 16) : 210 j > 23,625 j → too-long
      // 16 restants > 6 → 11 gardés ; distances toutes nulles → à égalité on garde les plus récents
      // → indices 5..15 utilisés, indices 0..4 trimmed
      const analysis = analyze([...Array(16).fill(7 * DAY), 210 * DAY])
      expect(analysis.medianMs).toBe(7 * DAY)
      expect(analysis.upperMs).toBeCloseTo(23.625 * DAY, 3)
      expect(analysis.lowerMs).toBeCloseTo((7 / 3.375) * DAY, 3)
      const { samples } = analysis
      expect(samples[16]).toMatchObject({ used: false, exclusion: 'too-long' })
      for (let i = 0; i <= 4; i++) expect(samples[i]).toMatchObject({ used: false, exclusion: 'trimmed' })
      for (let i = 5; i <= 15; i++) expect(samples[i]).toMatchObject({ used: true, exclusion: null })
    })

    it('flags a very short interval as too short', () => {
      const analysis = analyze([10 * DAY, 10 * DAY, 10 * DAY, 10 * DAY, 1 * DAY])
      expect(analysis.samples[4]).toMatchObject({ used: false, exclusion: 'too-short' })
      expect(analysis.samples.filter((s) => s.used)).toHaveLength(4)
    })

    it('keeps the intervals brought back by the two-interval guard', () => {
      // même scénario que « always keeps at least two intervals » : A et C conservés, B écarté
      const analysis = analyze([10_000, 100_000, 20], [10, 1, 1, 1])
      expect(analysis.samples.map((s) => [s.used, s.exclusion])).toEqual([
        [true, null],
        [false, 'too-long'],
        [true, null],
      ])
    })

    it('shares its statistics with computeIntervalStats', () => {
      const todo = { quantity: 1, unit: '', timings: buildTimings([3 * DAY, 2 * DAY, 40 * DAY], [3, 1, 1, 1]) }
      expect(analyzeIntervals(todo).stats).toEqual(computeIntervalStats(todo))
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
