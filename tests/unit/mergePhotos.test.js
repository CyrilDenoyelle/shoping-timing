import { describe, it, expect } from 'vitest'
import { mergeReceiptTexts } from '@/utils/receipt/mergePhotos.js'

describe('mergeReceiptTexts', () => {
  it('supprime le chevauchement entre deux photos', () => {
    const merged = mergeReceiptTexts(['A\nB\nC\nD', 'C\nD\nE'])
    expect(merged).toBe('A\nB\nC\nD\nE')
  })

  it('concatène deux photos sans chevauchement', () => {
    expect(mergeReceiptTexts(['A\nB', 'X\nY'])).toBe('A\nB\nX\nY')
  })

  it('ignore un chevauchement d’une seule ligne (trop ambigu)', () => {
    expect(mergeReceiptTexts(['A\nB\nZ', 'B\nC'])).toBe('A\nB\nZ\nB\nC')
  })

  it('compare sans tenir compte de la casse ni des espaces multiples', () => {
    expect(mergeReceiptTexts(['Pain  AU   lait\nX', 'pain au lait\nX\nY'])).toBe('Pain  AU   lait\nX\nY')
  })
})
