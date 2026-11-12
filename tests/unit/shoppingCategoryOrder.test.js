import { describe, it, expect } from 'vitest'
import {
  alignShoppingCategoryOrder,
  moveShoppingCategoryOrder,
} from '@/utils/todo/shoppingCategoryOrder.js'

describe('alignShoppingCategoryOrder', () => {
  it('keeps a stored order and appends new lists', () => {
    expect(alignShoppingCategoryOrder(['a', 'b', 'c'], ['c', 'a'])).toEqual(['c', 'a', 'b'])
  })

  it('drops deleted ids and ignores duplicates', () => {
    expect(alignShoppingCategoryOrder(['a', 'b'], ['b', 'gone', 'b', 'a'])).toEqual(['b', 'a'])
  })

  it('falls back to list order when nothing is stored', () => {
    expect(alignShoppingCategoryOrder(['a', 'b'], null)).toEqual(['a', 'b'])
  })
})

describe('moveShoppingCategoryOrder', () => {
  it('places the moved id above the target', () => {
    expect(moveShoppingCategoryOrder(['manger', 'maison', 'hygiene'], 'hygiene', 'manger', 'before')).toEqual([
      'hygiene',
      'manger',
      'maison',
    ])
  })

  it('places the moved id below the target', () => {
    expect(moveShoppingCategoryOrder(['manger', 'maison', 'hygiene'], 'hygiene', 'manger', 'after')).toEqual([
      'manger',
      'hygiene',
      'maison',
    ])
    expect(moveShoppingCategoryOrder(['manger', 'maison', 'hygiene'], 'manger', 'hygiene', 'after')).toEqual([
      'maison',
      'hygiene',
      'manger',
    ])
  })

  it('leaves the order unchanged for an unknown id', () => {
    expect(moveShoppingCategoryOrder(['a', 'b'], 'a', 'missing')).toEqual(['a', 'b'])
  })
})
