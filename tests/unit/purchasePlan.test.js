import { describe, it, expect } from 'vitest'
import { isBoughtToday, planReceiptPurchase, PURCHASE_ACTIONS } from '@/utils/receipt/purchasePlan.js'

const now = new Date(2026, 10, 24, 14, 0).getTime()
const earlierToday = new Date(2026, 10, 24, 9, 0).getTime()
const yesterday = new Date(2026, 10, 23, 20, 0).getTime()

const todo = (done, timings) => ({ done, timings })

describe('isBoughtToday', () => {
  it('reconnaît un achat daté du jour', () => {
    expect(isBoughtToday(todo(true, [{ start: yesterday, end: earlierToday }]), now)).toBe(true)
  })
  it('refuse un achat de la veille', () => {
    expect(isBoughtToday(todo(true, [{ start: yesterday, end: yesterday }]), now)).toBe(false)
  })
  it('refuse un produit décoché', () => {
    expect(isBoughtToday(todo(false, [{ start: earlierToday }]), now)).toBe(false)
  })
  it('refuse un produit sans historique', () => {
    expect(isBoughtToday(todo(true, []), now)).toBe(false)
  })
})

describe('planReceiptPurchase', () => {
  it('coche un produit à acheter', () => {
    expect(planReceiptPurchase(todo(false, [{ start: yesterday }]), now)).toBe(PURCHASE_ACTIONS.CHECK)
  })
  it('ne fait rien pour un produit déjà acheté aujourd’hui', () => {
    expect(planReceiptPurchase(todo(true, [{ start: yesterday, end: earlierToday }]), now)).toBe(
      PURCHASE_ACTIONS.SKIP,
    )
  })
  it('enregistre un nouvel achat pour un produit coché avant aujourd’hui', () => {
    expect(planReceiptPurchase(todo(true, [{ start: yesterday, end: yesterday }]), now)).toBe(
      PURCHASE_ACTIONS.RECORD,
    )
  })
})
