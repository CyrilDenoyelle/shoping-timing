import { describe, it, expect } from 'vitest'
import {
  formatPurchaseQtyLabel,
  collectPurchaseEvents,
  buildTimelineSeries,
} from '@/utils/stats/purchaseTimeline.js'

describe('purchaseTimeline', () => {
  describe('formatPurchaseQtyLabel', () => {
    it('formats integer and decimal quantities with unit', () => {
      expect(formatPurchaseQtyLabel(2, 'kg')).toBe('2 kg')
      expect(formatPurchaseQtyLabel(1.5, 'L')).toBe('1.5 L')
    })

    it('omits unit when empty', () => {
      expect(formatPurchaseQtyLabel(3, '')).toBe('3')
    })
  })

  describe('collectPurchaseEvents', () => {
    it('collects completed timings and ignores open ones', () => {
      const lists = [
        {
          name: 'Courses',
          todos: [
            {
              text: 'Lait',
              timings: [
                { end: 1000, quantity: 2, unit: 'L' },
                { start: 2000 },
              ],
            },
            {
              text: 'Pain',
              timings: [{ end: 3000, quantity: 1, unit: '' }],
            },
          ],
        },
      ]

      const events = collectPurchaseEvents(lists)
      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({
        at: 1000,
        listName: 'Courses',
        text: 'Lait',
        quantity: 2,
        unit: 'L',
      })
      expect(events[1]).toMatchObject({ at: 3000, text: 'Pain' })
    })

    it('sorts events chronologically', () => {
      const lists = [
        {
          name: 'A',
          todos: [{ text: 'X', timings: [{ end: 5000 }] }],
        },
        {
          name: 'B',
          todos: [{ text: 'Y', timings: [{ end: 1000 }] }],
        },
      ]
      const events = collectPurchaseEvents(lists)
      expect(events.map((e) => e.at)).toEqual([1000, 5000])
    })

    it('returns empty array for invalid input', () => {
      expect(collectPurchaseEvents(null)).toEqual([])
    })
  })

  describe('buildTimelineSeries', () => {
    const nowMs = Date.UTC(2026, 5, 15, 12, 0, 0)

    it('returns empty series when period is all and there are no events', () => {
      const result = buildTimelineSeries([], nowMs, 'all')
      expect(result.total).toBe(0)
      expect(result.labels).toEqual([])
      expect(result.counts).toEqual([])
    })

    it('buckets events in a 7-day window by day', () => {
      const dayA = nowMs - 2 * 86_400_000
      const dayB = nowMs - 1 * 86_400_000
      const events = [
        { at: dayA + 3600_000, listName: 'Courses', text: 'Lait', quantity: 2, unit: 'L' },
        { at: dayA + 7200_000, listName: 'Courses', text: 'Pain', quantity: 1, unit: '' },
        { at: dayB + 3600_000, listName: 'Courses', text: 'Lait', quantity: 1, unit: 'L' },
      ]

      const result = buildTimelineSeries(events, nowMs, '7d')
      expect(result.total).toBe(3)
      expect(result.bucketMode).toBe('day')
      expect(result.labels.length).toBe(result.counts.length)
      expect(result.counts.reduce((a, b) => a + b, 0)).toBe(3)
    })

    it('aggregates tooltip rows by product, list and unit', () => {
      const at = nowMs - 86_400_000
      const events = [
        { at, listName: 'Courses', text: 'Lait', quantity: 2, unit: 'L' },
        { at: at + 1000, listName: 'Courses', text: 'Lait', quantity: 1, unit: 'L' },
      ]

      const result = buildTimelineSeries(events, nowMs, '7d')
      const bucketWithItems = result.tooltipRowsPerBucket.find((b) => b.items.length > 0)
      expect(bucketWithItems.items).toHaveLength(1)
      expect(bucketWithItems.items[0]).toMatchObject({
        text: 'Lait',
        list: 'Courses',
        unit: 'L',
        quantitySum: 3,
      })
    })
  })
})
