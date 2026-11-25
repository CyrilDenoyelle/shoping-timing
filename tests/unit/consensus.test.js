import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { nameSimilarity, alignProducts, consensusProducts } from '@/utils/receipt/consensus.js'
import { analyzePasses } from '@/utils/receipt/analyzeReceipt.js'

function fixture(name) {
  return readFileSync(fileURLToPath(new URL(`../fixtures/receipts/${name}`, import.meta.url)), 'utf8')
}

function product(name, totalCents, extra = {}) {
  return {
    name,
    raw: name,
    quantity: 1,
    unitCents: totalCents,
    totalCents,
    discountCents: 0,
    weightGrams: null,
    uncertain: false,
    quantityMismatch: false,
    ...extra,
  }
}

describe('nameSimilarity', () => {
  it('vaut 1 pour deux noms identiques, accents et casse ignorés', () => {
    expect(nameSimilarity('Mélange de graines', 'MELANGE DE GRAINES')).toBe(1)
  })

  it('reste élevée pour un nom abîmé par l’OCR', () => {
    expect(nameSimilarity('Boisson noisette bio', 'Boisson. roiverié bio')).toBeGreaterThan(0.45)
  })

  it('reste basse pour deux produits différents', () => {
    expect(nameSimilarity('Brocoli', 'Mozzarella sans OGM')).toBeLessThan(0.3)
  })

  it('renvoie 0 pour un nom trop court', () => {
    expect(nameSimilarity('A', 'A')).toBe(0)
  })
})

describe('alignProducts', () => {
  it('apparie les produits dans l’ordre et laisse -1 aux absents', () => {
    const reference = [product('Pain de mie', 162), product('Brocoli', 198), product('Concombre', 258)]
    const other = [product('Pain de mie', 162), product('Concombre', 258)]
    expect(alignProducts(reference, other)).toEqual([0, -1, 1])
  })

  it('conserve l’ordre malgré deux noms proches', () => {
    const reference = [product('Muesli Noisette', 276), product('Muesli choco caramel', 276)]
    const other = [product('Muesli chocô caramel', 276), product('Muesli Noisette', 216)]
    const mapping = alignProducts(reference, other)
    // Appariement monotone : au plus un des deux produits trouve son équivalent.
    const matched = mapping.filter((i) => i >= 0)
    expect(matched).toEqual([...matched].sort((a, b) => a - b))
  })
})

describe('consensusProducts', () => {
  it('garde sans changement une ligne que la référence lit sans doute', () => {
    const ref = { id: 'a', products: [product('Pain', 162)] }
    const other = { id: 'b', products: [product('Pain', 182)] }
    expect(consensusProducts([ref, other])[0].totalCents).toBe(162)
  })

  it('remplace une ligne douteuse par le montant fiable d’une autre lecture', () => {
    const ref = { id: 'a', products: [product('Brocoli', 199, { uncertain: true })] }
    const other = { id: 'b', products: [product('Brocoli', 198)] }
    const [result] = consensusProducts([ref, other])
    expect(result.totalCents).toBe(198)
  })

  it('confirme un montant lu par deux lectures dont une fiable', () => {
    const ref = { id: 'a', products: [product('Brocoli', 198, { uncertain: true })] }
    const second = { id: 'b', products: [product('Brocoli', 198)] }
    const [result] = consensusProducts([ref, second])
    expect(result.uncertain).toBe(false)
    expect(result.votes).toBe(2)
  })

  it('laisse à vérifier un montant que seules des lectures douteuses partagent', () => {
    const ref = { id: 'a', products: [product('Pomme Golden', 289, { uncertain: true })] }
    const second = { id: 'b', products: [product('Pomme Golden', 289, { uncertain: true })] }
    const [result] = consensusProducts([ref, second])
    expect(result.uncertain).toBe(true)
  })

  it('reprend une remise lue par une autre lecture', () => {
    const ref = { id: 'a', products: [product('Special Flakes', 199, { uncertain: true })] }
    const other = { id: 'b', products: [product('Special Flakes', 199, { discountCents: 10 })] }
    expect(consensusProducts([ref, other])[0].discountCents).toBe(10)
  })

  it('renvoie la référence seule quand il n’y a qu’une lecture', () => {
    const ref = { id: 'a', products: [product('Pain', 162)] }
    expect(consensusProducts([ref])).toEqual(ref.products)
    expect(consensusProducts([])).toEqual([])
  })
})

const TRUTH_COLUMNS = [
  162, 109, 328, 12, 56, 115, 198, 299, 166, 359, 299, 179, 99, 258, 231, 190, 199, 139, 209, 152, 352,
  359, 90, 95, 780, 379, 276, 276, 78, 109, 659, 145, 648,
]
const TRUTH_SIMPLE = [145, 60, 984, 318, 12, 64, 779, 231, 203, 279, 478]

function rightTotals(products, truth) {
  const pool = [...truth]
  let right = 0
  for (const p of products) {
    const i = pool.indexOf(p.totalCents)
    if (i >= 0) {
      right++
      pool.splice(i, 1)
    }
  }
  return right
}

function analyze(prefix) {
  return analyzePasses(
    ['clean-wide', 'clean', 'original'].map((id) => ({
      id,
      label: id,
      texts: [fixture(`${prefix}-passe-${id}.txt`)],
    })),
  )
}

describe('analyse de trois passes sur un ticket à colonnes (textes OCR réels)', () => {
  const analysis = analyze('ticket-colonnes')

  it('lit au moins autant de totaux justes que chaque passe prise seule', () => {
    const bestSingle = Math.max(...analysis.passes.map((p) => rightTotals(p.products, TRUTH_COLUMNS)))
    expect(rightTotals(analysis.best.products, TRUTH_COLUMNS)).toBeGreaterThanOrEqual(bestSingle)
  })

  it('réduit le nombre de lignes à vérifier par rapport à la passe de référence', () => {
    const reference = analysis.passes.find((p) => p.id === analysis.best.id)
    expect(analysis.best.summary.flaggedCount).toBeLessThanOrEqual(reference.summary.flaggedCount)
  })

  it('partage le total et le nombre de lignes lus par les passes', () => {
    expect(analysis.declared.declaredTotalCents).toBe(7939)
    expect(analysis.best.summary.declaredTotalCents).toBe(7939)
  })
})

describe('analyse de trois passes sur un ticket simple (textes OCR réels)', () => {
  const analysis = analyze('ticket-simple')

  it('partage le total et le nombre d’articles déclarés', () => {
    expect(analysis.declared.declaredTotalCents).toBe(3553)
    expect(analysis.declared.declaredCount).toBe(14)
  })

  it('lit au moins 9 totaux justes sur 11', () => {
    expect(rightTotals(analysis.best.products, TRUTH_SIMPLE)).toBeGreaterThanOrEqual(9)
  })

  it('confirme le nombre d’articles', () => {
    expect(analysis.best.summary.countMatches).toBe(true)
  })
})
