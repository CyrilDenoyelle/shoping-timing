import { describe, it, expect } from 'vitest'
import {
  buildVirtualRows,
  estimateRowSize,
  listBoundsFromMeasurements,
  findTodoRowIndex,
  findListHeaderRowIndex,
} from '@/utils/todo/virtualRows.js'

describe('buildVirtualRows', () => {
  const lists = [
    {
      id: 'a',
      name: 'A',
      displayTodos: [
        { id: 1, text: 'one', done: false },
        { id: 2, text: 'two', done: true },
      ],
    },
    { id: 'b', name: 'B', displayTodos: [] },
  ]

  it('builds headers, todos, empty drop and add-list', () => {
    const rows = buildVirtualRows({
      displayLists: lists,
      manualSort: true,
    })
    expect(rows.map((r) => r.type)).toEqual([
      'list-header',
      'todo',
      'todo',
      'list-header',
      'list-empty',
      'add-list',
    ])
    expect(rows[0].isFirstList).toBe(true)
    expect(rows[3].isFirstList).toBe(false)
    expect(findTodoRowIndex(rows, 'a', 2)).toBe(2)
    expect(findListHeaderRowIndex(rows, 'b')).toBe(3)
  })

  it('prepends shopping todos when shopping mode is on', () => {
    const rows = buildVirtualRows({
      shoppingMode: true,
      shoppingTodos: [{ id: 9, listId: 'a', text: 'milk', done: false }],
      displayLists: [{ id: 'a', name: 'A', displayTodos: [{ id: 2, text: 'two', done: true }] }],
      manualSort: false,
    })
    expect(rows[0].type).toBe('shopping-todo')
    expect(rows[1].type).toBe('shopping-end')
    expect(rows[2].type).toBe('list-header')
    expect(rows[2].isFirstList).toBe(false)
    expect(rows[3].compact).toBe(true)
  })
})

describe('listBoundsFromMeasurements', () => {
  it('spans each list from header through its todos', () => {
    const rows = buildVirtualRows({
      displayLists: [
        { id: 'a', name: 'A', displayTodos: [{ id: 1, text: 'one' }] },
        { id: 'b', name: 'B', displayTodos: [{ id: 2, text: 'two' }] },
      ],
    })
    const measurements = [
      { index: 0, start: 100, size: 40, end: 140 },
      { index: 1, start: 140, size: 44, end: 184 },
      { index: 2, start: 184, size: 40, end: 224 },
      { index: 3, start: 224, size: 44, end: 268 },
      { index: 4, start: 268, size: 56, end: 324 },
    ]
    expect(listBoundsFromMeasurements(rows, measurements)).toEqual([
      { id: 'a', top: 100, span: 84 },
      { id: 'b', top: 184, span: 84 },
    ])
  })
})

describe('estimateRowSize', () => {
  it('returns stable estimates by type', () => {
    expect(estimateRowSize({ type: 'list-header', isFirstList: true })).toBe(36)
    expect(estimateRowSize({ type: 'todo', compact: true })).toBe(28)
    expect(estimateRowSize({ type: 'add-list' })).toBe(56)
  })
})
