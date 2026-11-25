import { describe, it, expect } from 'vitest'
import { GRID_COLUMNS } from '@/utils/stats/gridLayout.js'
import {
  splitProductsIntoGridRows,
  buildRhythmVirtualRows,
  estimateRhythmRowSize,
  findCardRowIndex,
  CARD_ROW_ESTIMATE_PX,
  GROUP_HEADER_ESTIMATE_PX,
  GROUP_GAP_PX,
} from '@/utils/stats/rhythmVirtualRows.js'

const product = (key) => ({ key, text: key })

describe('rhythmVirtualRows', () => {
  describe('splitProductsIntoGridRows', () => {
    it('groups cards into rows that fill the grid width', () => {
      const products = [1, 2, 3, 4, 5, 6, 7].map((n) => product(`p${n}`))
      // 7 cards, 3 columns → spans [4,4,4, 6,6, 6,6]
      const spans = [4, 4, 4, 6, 6, 6, 6]
      const rows = splitProductsIntoGridRows(products, spans)
      expect(rows.map((r) => r.length)).toEqual([3, 2, 2])
      expect(rows[0].every((c) => c.span === 4)).toBe(true)
      expect(rows.flat().map((c) => c.product.key)).toEqual(products.map((p) => p.key))
    })

    it('keeps an expanded full-width card alone on its row', () => {
      const products = [0, 1, 2, 3].map((n) => product(`p${n}`))
      const spans = [12, 4, 4, 4]
      const rows = splitProductsIntoGridRows(products, spans)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveLength(1)
      expect(rows[0][0].span).toBe(GRID_COLUMNS)
      expect(rows[1]).toHaveLength(3)
    })
  })

  describe('buildRhythmVirtualRows', () => {
    it('emits a header then card-rows per group', () => {
      const groups = [
        {
          listId: 'a',
          listName: 'A',
          products: [product('a1'), product('a2'), product('a3')],
        },
        {
          listId: 'b',
          listName: 'B',
          products: [product('b1')],
        },
      ]
      const rows = buildRhythmVirtualRows(groups, 3, null)
      expect(rows.map((r) => r.type)).toEqual([
        'group-header',
        'card-row',
        'group-header',
        'card-row',
      ])
      expect(rows[0].isFirst).toBe(true)
      expect(rows[0].productCount).toBe(3)
      expect(rows[1].cards).toHaveLength(3)
      expect(rows[2].isFirst).toBe(false)
      expect(rows[3].cards[0].span).toBe(GRID_COLUMNS)
    })

    it('isolates the expanded card on its own row', () => {
      const groups = [
        {
          listId: 'a',
          listName: 'A',
          products: [product('a1'), product('a2'), product('a3'), product('a4')],
        },
      ]
      const rows = buildRhythmVirtualRows(groups, 3, 'a2')
      const cardRows = rows.filter((r) => r.type === 'card-row')
      expect(cardRows.some((r) => r.hasExpanded)).toBe(true)
      const expandedRow = cardRows.find((r) => r.hasExpanded)
      expect(expandedRow.cards).toHaveLength(1)
      expect(expandedRow.cards[0].product.key).toBe('a2')
      expect(expandedRow.cards[0].span).toBe(GRID_COLUMNS)
    })
  })

  describe('estimateRhythmRowSize', () => {
    it('sizes headers and card rows', () => {
      expect(estimateRhythmRowSize({ type: 'group-header', isFirst: true })).toBe(
        GROUP_HEADER_ESTIMATE_PX,
      )
      expect(estimateRhythmRowSize({ type: 'group-header', isFirst: false })).toBe(
        GROUP_HEADER_ESTIMATE_PX + GROUP_GAP_PX,
      )
      expect(estimateRhythmRowSize({ type: 'card-row', hasExpanded: false })).toBe(
        CARD_ROW_ESTIMATE_PX,
      )
      expect(estimateRhythmRowSize({ type: 'card-row', hasExpanded: true }, 500)).toBe(500)
    })
  })

  describe('findCardRowIndex', () => {
    it('finds the virtual row that contains a product', () => {
      const rows = buildRhythmVirtualRows(
        [{ listId: 'a', listName: 'A', products: [product('x'), product('y')] }],
        2,
        null,
      )
      expect(findCardRowIndex(rows, 'y')).toBe(1)
      expect(findCardRowIndex(rows, 'missing')).toBe(-1)
    })
  })
})
