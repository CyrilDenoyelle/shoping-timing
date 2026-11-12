import { describe, it, expect } from 'vitest'
import {
  buildVirtualRows,
  estimateRowSize,
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
      shoppingTodos: [{ id: 9, listId: 'a', listName: 'A', text: 'milk', done: false }],
      displayLists: [{ id: 'a', name: 'A', displayTodos: [{ id: 2, text: 'two', done: true }] }],
      manualSort: false,
    })
    expect(rows[0].type).toBe('shopping-category')
    expect(rows[0].listName).toBe('A')
    expect(rows[0].isFirstCategory).toBe(true)
    expect(rows[1].type).toBe('shopping-todo')
    expect(rows[2].type).toBe('shopping-end')
    expect(rows[3].type).toBe('list-header')
    expect(rows[3].isFirstList).toBe(false)
    expect(rows[4].compact).toBe(true)
  })

  it('groups shopping todos under their category', () => {
    const rows = buildVirtualRows({
      shoppingMode: true,
      shoppingTodos: [
        { id: 1, listId: 'eat', listName: 'Manger', text: 'riz', done: false },
        { id: 2, listId: 'eat', listName: 'Manger', text: 'pates', done: false },
        { id: 3, listId: 'home', listName: 'Maison', text: 'lessive', done: false },
      ],
      displayLists: [],
      manualSort: false,
    })
    expect(rows.map((r) => r.type)).toEqual([
      'shopping-category',
      'shopping-todo',
      'shopping-todo',
      'shopping-category',
      'shopping-todo',
      'shopping-end',
      'add-list',
    ])
    expect(rows[0].listName).toBe('Manger')
    expect(rows[2].isLastInCategory).toBe(true)
    expect(rows[1].isLastInCategory).toBe(false)
    expect(rows[3].listName).toBe('Maison')
    expect(rows[3].categoryIndex).toBe(1)
    expect(rows[3].isFirstCategory).toBe(false)
    expect(rows[4].isLastInCategory).toBe(true)
    expect(findTodoRowIndex(rows, 'eat', 2)).toBe(2)
  })
})

describe('estimateRowSize', () => {
  it('returns stable estimates by type', () => {
    expect(estimateRowSize({ type: 'list-header', isFirstList: true })).toBe(36)
    expect(estimateRowSize({ type: 'shopping-category', isFirstCategory: true })).toBe(32)
    expect(estimateRowSize({ type: 'shopping-category', isFirstCategory: false })).toBe(48)
    expect(estimateRowSize({ type: 'todo', compact: true })).toBe(28)
    expect(estimateRowSize({ type: 'add-list' })).toBe(56)
  })
})
