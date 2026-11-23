import { describe, it, expect } from 'vitest'
import {
  GRID_COLUMNS,
  MAX_COLUMNS,
  balancedRows,
  cardSpans,
  cardSpansAround,
  columnsForWidth,
} from '@/utils/stats/gridLayout.js'

describe('gridLayout', () => {
  describe('columnsForWidth', () => {
    it('fits as many columns as the width allows, within 1..MAX_COLUMNS', () => {
      expect(columnsForWidth(320)).toBe(1)
      expect(columnsForWidth(649)).toBe(1)
      expect(columnsForWidth(650)).toBe(2)
      expect(columnsForWidth(1000)).toBe(3)
      expect(columnsForWidth(1456)).toBe(4)
      expect(columnsForWidth(5000)).toBe(MAX_COLUMNS)
    })

    it('falls back to one column for unusable widths', () => {
      expect(columnsForWidth(0)).toBe(1)
      expect(columnsForWidth(-10)).toBe(1)
      expect(columnsForWidth(Number.NaN)).toBe(1)
    })

    it('honors a custom minimum width and maximum', () => {
      expect(columnsForWidth(1000, { minColumnWidth: 200, gap: 0 })).toBe(4)
      expect(columnsForWidth(1000, { minColumnWidth: 200, gap: 0, maxColumns: 2 })).toBe(2)
    })
  })

  describe('balancedRows', () => {
    it('spreads cards evenly, bigger rows first', () => {
      expect(balancedRows(7, 3)).toEqual([3, 2, 2])
      expect(balancedRows(7, 4)).toEqual([4, 3])
      expect(balancedRows(5, 3)).toEqual([3, 2])
      expect(balancedRows(4, 3)).toEqual([2, 2])
      expect(balancedRows(10, 3)).toEqual([3, 3, 2, 2])
    })

    it('uses full rows when the count divides evenly', () => {
      expect(balancedRows(6, 3)).toEqual([3, 3])
      expect(balancedRows(8, 4)).toEqual([4, 4])
    })

    it('handles small and single-column cases', () => {
      expect(balancedRows(1, 4)).toEqual([1])
      expect(balancedRows(2, 4)).toEqual([2])
      expect(balancedRows(3, 1)).toEqual([1, 1, 1])
      expect(balancedRows(0, 3)).toEqual([])
      expect(balancedRows(-2, 3)).toEqual([])
    })

    it('keeps rows within one card of each other and within the column limit', () => {
      for (let columns = 1; columns <= MAX_COLUMNS; columns++) {
        for (let count = 1; count <= 40; count++) {
          const rows = balancedRows(count, columns)
          expect(rows.reduce((a, b) => a + b, 0)).toBe(count)
          expect(Math.max(...rows)).toBeLessThanOrEqual(columns)
          expect(Math.max(...rows) - Math.min(...rows)).toBeLessThanOrEqual(1)
        }
      }
    })

    it('never leaves a lone card in the last row from 3 columns up (except for a single card)', () => {
      for (let columns = 3; columns <= MAX_COLUMNS; columns++) {
        for (let count = 2; count <= 40; count++) {
          const rows = balancedRows(count, columns)
          expect(rows[rows.length - 1]).toBeGreaterThanOrEqual(2)
        }
      }
    })

    it('caps the requested columns at MAX_COLUMNS', () => {
      expect(Math.max(...balancedRows(30, 99))).toBeLessThanOrEqual(MAX_COLUMNS)
    })
  })

  describe('cardSpans', () => {
    it('gives each card the share of its row, filling all grid columns', () => {
      expect(cardSpans(7, 3)).toEqual([4, 4, 4, 6, 6, 6, 6])
      expect(cardSpans(7, 4)).toEqual([3, 3, 3, 3, 4, 4, 4])
      expect(cardSpans(1, 4)).toEqual([GRID_COLUMNS])
    })

    it('sums to a multiple of the grid width for every layout', () => {
      for (let columns = 1; columns <= MAX_COLUMNS; columns++) {
        for (let count = 1; count <= 40; count++) {
          const spans = cardSpans(count, columns)
          expect(spans).toHaveLength(count)
          expect(spans.every((span) => Number.isInteger(span))).toBe(true)
          const rows = balancedRows(count, columns)
          expect(spans.reduce((a, b) => a + b, 0)).toBe(rows.length * GRID_COLUMNS)
        }
      }
    })
  })

  describe('cardSpansAround', () => {
    it('gives the focused card its own full-width row between two balanced blocks', () => {
      // 7 cartes, la 4e agrandie : 3 avant, 3 après
      expect(cardSpansAround(7, 3, 3)).toEqual([4, 4, 4, 12, 4, 4, 4])
      // 8 cartes, la 3e agrandie : 2 avant, 5 après (3 puis 2 par rangée)
      expect(cardSpansAround(8, 2, 3)).toEqual([6, 6, 12, 4, 4, 4, 6, 6])
    })

    it('handles a focused card at either end', () => {
      expect(cardSpansAround(4, 0, 3)).toEqual([12, 4, 4, 4])
      expect(cardSpansAround(4, 3, 3)).toEqual([4, 4, 4, 12])
      expect(cardSpansAround(1, 0, 4)).toEqual([GRID_COLUMNS])
    })

    it('falls back to the normal layout without a valid focus', () => {
      expect(cardSpansAround(7, -1, 3)).toEqual(cardSpans(7, 3))
      expect(cardSpansAround(7, 7, 3)).toEqual(cardSpans(7, 3))
      expect(cardSpansAround(7, null, 3)).toEqual(cardSpans(7, 3))
      expect(cardSpansAround(7, undefined, 3)).toEqual(cardSpans(7, 3))
    })

    it('keeps card order and always fills whole rows, whatever the focus and column count', () => {
      for (let columns = 1; columns <= MAX_COLUMNS; columns++) {
        for (let count = 1; count <= 25; count++) {
          for (let focus = 0; focus < count; focus++) {
            const spans = cardSpansAround(count, focus, columns)
            expect(spans).toHaveLength(count)
            // La carte agrandie est seule sur sa rangée
            expect(spans[focus]).toBe(GRID_COLUMNS)
            // Chaque rangée se termine exactement à GRID_COLUMNS : la carte suivante commence une nouvelle rangée
            let filled = 0
            for (const span of spans) {
              filled += span
              expect(filled).toBeLessThanOrEqual(GRID_COLUMNS)
              if (filled === GRID_COLUMNS) filled = 0
            }
            expect(filled).toBe(0)
          }
        }
      }
    })
  })
})
