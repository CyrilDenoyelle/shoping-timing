import { describe, it, expect } from 'vitest'
import { DAY } from '@/utils/time.js'
import {
  buildProductRhythms,
  buildRhythmChartModel,
  describeExclusion,
  durationUnitFor,
  filterGroupsByPointCount,
  filterProductGroups,
  normalizeSearch,
  summarizeExclusions,
} from '@/utils/stats/productRhythm.js'

const HOUR = 3_600_000

// Achats successifs : intervals[i] = durée entre l'achat i et i+1, quantities[i] = quantité de l'achat i
const timingsFrom = (intervals, quantities = [], unit = '') => {
  let end = 0
  const timings = [{ end, quantity: quantities[0] ?? 1, unit }]
  intervals.forEach((ms, i) => {
    end += ms
    timings.push({ end, quantity: quantities[i + 1] ?? 1, unit })
  })
  return timings
}

describe('productRhythm', () => {
  describe('durationUnitFor', () => {
    it('picks the most readable unit', () => {
      expect(durationUnitFor(90 * 60_000).id).toBe('minute')
      expect(durationUnitFor(1 * DAY).id).toBe('hour')
      expect(durationUnitFor(2 * DAY).id).toBe('day')
      expect(durationUnitFor(119 * DAY).id).toBe('day')
      expect(durationUnitFor(120 * DAY).id).toBe('week')
      expect(durationUnitFor(729 * DAY).id).toBe('week')
      expect(durationUnitFor(730 * DAY).id).toBe('month')
    })
  })

  describe('describeExclusion', () => {
    it('labels each reason', () => {
      expect(describeExclusion('too-long')).toBe('trop long')
      expect(describeExclusion('too-short')).toBe('trop court')
      expect(describeExclusion('trimmed')).toContain('noyau')
      expect(describeExclusion('unknown')).toBe('écarté')
    })
  })

  describe('summarizeExclusions', () => {
    it('returns an empty string when nothing is excluded', () => {
      expect(summarizeExclusions({ 'too-long': 0, 'too-short': 0, trimmed: 0 })).toBe('')
    })

    it('agrees the labels with their count', () => {
      expect(summarizeExclusions({ 'too-long': 1, 'too-short': 0, trimmed: 0 })).toBe('1 trop long')
      expect(summarizeExclusions({ 'too-long': 2, 'too-short': 3, trimmed: 0 })).toBe('2 trop longs · 3 trop courts')
      expect(summarizeExclusions({ 'too-long': 1, 'too-short': 0, trimmed: 5 })).toBe(
        '1 trop long · 5 éloignés du noyau du rythme',
      )
      expect(summarizeExclusions({ 'too-long': 0, 'too-short': 0, trimmed: 1 })).toBe(
        '1 éloigné du noyau du rythme',
      )
    })
  })

  describe('buildProductRhythms', () => {
    const milk = { id: 1, text: 'Lait', quantity: 2, unit: 'L', timings: timingsFrom([4 * DAY, 4 * DAY, 4 * DAY], [2, 2, 2, 2], 'L') }
    const lonely = { id: 2, text: 'Seul', quantity: 1, unit: '', timings: [{ end: 0, quantity: 1, unit: '' }] }

    it('keeps only products with a measurable interval, grouped by list', () => {
      const groups = buildProductRhythms([
        { id: 'l1', name: 'Manger', todos: [milk, lonely] },
        { id: 'l2', name: 'Vide', todos: [lonely] },
      ])
      expect(groups).toHaveLength(1)
      expect(groups[0]).toMatchObject({ listId: 'l1', listName: 'Manger' })
      expect(groups[0].products).toHaveLength(1)
      expect(groups[0].products[0]).toMatchObject({
        key: 'l1:1',
        text: 'Lait',
        unit: 'L',
        selectorLabel: '2 L',
      })
    })

    it('carries the analysis of each product', () => {
      // 3 intervalles de 4 j pour 2 L chacun → 2 j/L ; sélecteur 2 L → 4 j
      const [{ products }] = buildProductRhythms([{ id: 'l1', name: 'Manger', todos: [milk] }])
      const [product] = products
      expect(product.samples).toHaveLength(3)
      expect(product.samples.every((s) => s.used)).toBe(true)
      expect(product.stats.averageMs).toBe(4 * DAY)
      expect(product.exclusions).toEqual({ 'too-long': 0, 'too-short': 0, trimmed: 0 })
    })

    it('exposes the last purchase and whether the product is on the shopping list', () => {
      const [{ products }] = buildProductRhythms([
        { id: 'l1', name: 'Manger', todos: [{ ...milk, done: true }, { ...milk, id: 9, done: false }] },
      ])
      // timingsFrom : 3 intervalles de 4 j → dernier achat à 12 j
      expect(products[0]).toMatchObject({ lastPurchaseAt: 12 * DAY, done: true })
      expect(products[1]).toMatchObject({ lastPurchaseAt: 12 * DAY, done: false })
    })

    it('counts the exclusions by reason', () => {
      // 16 × 7 j + pause de 210 j : 1 trop long, 0 trimmed (série régulière dans le noyau)
      const tomatoes = {
        id: 3,
        text: '  Tomates ',
        quantity: 1,
        unit: '',
        timings: timingsFrom([...Array(16).fill(7 * DAY), 210 * DAY]),
      }
      const [{ products }] = buildProductRhythms([{ id: 'l1', name: ' Manger ', todos: [tomatoes] }])
      expect(products[0].text).toBe('Tomates')
      expect(products[0].exclusions).toEqual({ 'too-long': 1, 'too-short': 0, trimmed: 0 })
    })

    it('falls back on a title and tolerates invalid input', () => {
      const untitled = { id: 4, quantity: 1, unit: '', timings: timingsFrom([DAY]) }
      expect(buildProductRhythms([{ id: 'l', name: 'L', todos: [untitled] }])[0].products[0].text).toBe('Sans titre')
      expect(buildProductRhythms(null)).toEqual([])
      expect(buildProductRhythms([{ id: 'l', name: 'L' }])).toEqual([])
    })
  })

  describe('buildRhythmChartModel', () => {
    const productOf = (todo) => buildProductRhythms([{ id: 'l1', name: 'L', todos: [todo] }])[0].products[0]

    it('plots one point per interval in the readable unit', () => {
      // 3 × 4 j pour 2 L (sélecteur 2) → durée 4 j par point, achats aux jours 4, 8 et 12
      // médiane 4 j → plage tolérée [4 / 3,375 ; 4 × 3,375] = [1,185 ; 13,5] j
      const model = buildRhythmChartModel(
        productOf({ id: 1, text: 'Lait', quantity: 2, unit: 'L', timings: timingsFrom([4 * DAY, 4 * DAY, 4 * DAY], [2, 2, 2, 2], 'L') }),
      )
      expect(model.unit.id).toBe('day')
      // X = ordre des intervalles (espacement uniforme) ; les dates restent dans `at`
      expect(model.points.map((p) => p.x)).toEqual([0, 1, 2])
      expect(model.points.map((p) => p.at)).toEqual([4 * DAY, 8 * DAY, 12 * DAY])
      expect(model.points.map((p) => p.y)).toEqual([4, 4, 4])
      expect(model.meanY).toBe(4)
      expect(model.band.upper).toBeCloseTo(13.5, 9)
      expect(model.band.lower).toBeCloseTo(4 / 3.375, 9)
    })

    it('pads the index range around the points', () => {
      const model = buildRhythmChartModel(
        productOf({ id: 1, text: 'Lait', quantity: 2, unit: 'L', timings: timingsFrom([4 * DAY, 4 * DAY, 4 * DAY], [2, 2, 2, 2], 'L') }),
      )
      expect(model.xRange).toEqual({ min: -0.35, max: 2.35 })
    })

    it('sizes points with the square root of the purchased quantity', () => {
      // A : 4 u (rayon 3 + 6×√(4/4) = 9) ; B : 1 u (rayon 3 + 6×√(1/4) = 6)
      const model = buildRhythmChartModel(
        productOf({ id: 2, text: 'Riz', quantity: 1, unit: '', timings: timingsFrom([4 * DAY, 1 * DAY], [4, 1, 1]) }),
      )
      expect(model.points.map((p) => p.radius)).toEqual([9, 6])
    })

    it('uses one common radius when every interval has the same weight', () => {
      const model = buildRhythmChartModel(
        productOf({ id: 2, text: 'Riz', quantity: 1, unit: '', timings: timingsFrom([4 * DAY, 1 * DAY, 2 * DAY]) }),
      )
      expect(model.points.map((p) => p.radius)).toEqual([5, 5, 5])
    })

    it('has no tolerated range with fewer than 3 intervals', () => {
      const model = buildRhythmChartModel(
        productOf({ id: 3, text: 'Sel', quantity: 1, unit: '', timings: timingsFrom([2 * DAY, 3 * DAY]) }),
      )
      expect(model.band).toBeNull()
      expect(model.meanY).toBeCloseTo(2.5, 9)
    })

    it('keeps the pause visible with its flag', () => {
      // 16 × 7 j + 210 j (30 sem.) : unité = semaine ; la pause vaut 30 sem. et reste marquée écartée
      const model = buildRhythmChartModel(
        productOf({ id: 4, text: 'Tomates', quantity: 1, unit: '', timings: timingsFrom([...Array(16).fill(7 * DAY), 210 * DAY]) }),
      )
      expect(model.unit.id).toBe('week')
      const pause = model.points[16]
      expect(pause.y).toBeCloseTo(30, 9)
      expect(pause).toMatchObject({ used: false, exclusion: 'too-long', intervalMs: 210 * DAY })
      expect(model.meanY).toBeCloseTo(1, 9)
      expect(model.points.filter((p) => p.used)).toHaveLength(16)
    })

    it('uses hours for short intervals', () => {
      const model = buildRhythmChartModel(
        productOf({ id: 5, text: 'Snack', quantity: 1, unit: '', timings: timingsFrom([6 * HOUR, 6 * HOUR]) }),
      )
      expect(model.unit.id).toBe('hour')
      expect(model.points.map((p) => p.y)).toEqual([6, 6])
    })
  })

  describe('normalizeSearch', () => {
    it('lowercases, strips accents and simplifies spaces', () => {
      expect(normalizeSearch('  ŒUFS   Bio  ')).toBe('œufs bio')
      expect(normalizeSearch('Hygiène')).toBe('hygiene')
      expect(normalizeSearch('Pâtes')).toBe('pates')
    })

    it('tolerates empty values', () => {
      expect(normalizeSearch('')).toBe('')
      expect(normalizeSearch(null)).toBe('')
      expect(normalizeSearch(undefined)).toBe('')
    })
  })

  describe('filterProductGroups', () => {
    const product = (id, text) => ({ key: `k${id}`, text })
    const groups = [
      { listId: 'a', listName: 'Manger', products: [product(1, 'Lait'), product(2, 'Pâtes'), product(3, 'Beurre')] },
      { listId: 'b', listName: 'Hygiène', products: [product(4, 'Savon'), product(5, 'Lait corporel')] },
    ]
    const texts = (result) => result.map((g) => g.products.map((p) => p.text))

    it('returns the same groups for an empty or blank query', () => {
      expect(filterProductGroups(groups, '')).toBe(groups)
      expect(filterProductGroups(groups, '   ')).toBe(groups)
    })

    it('matches product names without caring about case or accents', () => {
      expect(texts(filterProductGroups(groups, 'PATES'))).toEqual([['Pâtes']])
      expect(texts(filterProductGroups(groups, 'pâ'))).toEqual([['Pâtes']])
    })

    it('keeps each matching product in its own list and drops empty lists', () => {
      const result = filterProductGroups(groups, 'lait')
      expect(result.map((g) => g.listId)).toEqual(['a', 'b'])
      expect(texts(result)).toEqual([['Lait'], ['Lait corporel']])
      expect(filterProductGroups(groups, 'savon').map((g) => g.listId)).toEqual(['b'])
    })

    it('requires every word and also searches the list name', () => {
      expect(texts(filterProductGroups(groups, 'lait hygiene'))).toEqual([['Lait corporel']])
      expect(texts(filterProductGroups(groups, 'corporel lait'))).toEqual([['Lait corporel']])
      expect(filterProductGroups(groups, 'lait savon')).toEqual([])
    })

    it('keeps every product of a list whose name matches', () => {
      expect(texts(filterProductGroups(groups, 'manger'))).toEqual([['Lait', 'Pâtes', 'Beurre']])
    })

    it('returns an empty array when nothing matches and leaves the input untouched', () => {
      expect(filterProductGroups(groups, 'zzz')).toEqual([])
      expect(groups[0].products).toHaveLength(3)
    })
  })

  describe('filterGroupsByPointCount', () => {
    const product = (id, points) => ({ key: `k${id}`, samples: Array(points).fill({}) })
    const groups = [
      { listId: 'a', listName: 'Manger', products: [product(1, 1), product(2, 5), product(3, 2)] },
      { listId: 'b', listName: 'Maison', products: [product(4, 1)] },
    ]
    const keys = (result) => result.map((g) => g.products.map((p) => p.key))

    it('keeps products with at least the requested number of points', () => {
      expect(keys(filterGroupsByPointCount(groups, 2))).toEqual([['k2', 'k3']])
      expect(keys(filterGroupsByPointCount(groups, 5))).toEqual([['k2']])
    })

    it('drops lists left without products and leaves the input untouched', () => {
      expect(filterGroupsByPointCount(groups, 6)).toEqual([])
      expect(groups[1].products).toHaveLength(1)
    })

    it('returns the same groups when the threshold filters nothing', () => {
      expect(filterGroupsByPointCount(groups, 1)).toBe(groups)
      expect(filterGroupsByPointCount(groups, 0)).toBe(groups)
      expect(filterGroupsByPointCount(groups, Number.NaN)).toBe(groups)
    })
  })
})
