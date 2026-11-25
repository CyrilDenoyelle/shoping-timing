import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  tokenScore,
  scoreNames,
  matchProducts,
  searchCandidates,
} from '@/utils/receipt/matchProducts.js'

const candidates = [
  { id: 1, listId: 'a', text: 'Lait demi-écrémé' },
  { id: 2, listId: 'a', text: 'Pain de mie' },
  { id: 3, listId: 'b', text: 'Haché de boeuf' },
  { id: 4, listId: 'b', text: 'Yaourt nature' },
  { id: 5, listId: 'b', text: 'Sacs poubelle', receiptNames: ['SAC SOUPLE IM - AFPL'] },
  { id: 6, listId: 'b', text: 'Limonade' },
  { id: 7, listId: 'b', text: 'Eau Cristaline' },
]

describe('normalizeName', () => {
  it('retire accents, ponctuation et casse', () => {
    expect(normalizeName('  Lait Demi-Écrémé !')).toBe('lait demi ecreme')
  })
  it('gère les valeurs vides', () => {
    expect(normalizeName(null)).toBe('')
  })
})

describe('scores', () => {
  it('donne 1 pour deux noms identiques après normalisation', () => {
    expect(scoreNames('LAIT DEMI ECREME', 'Lait demi-écrémé')).toBe(1)
  })
  it('accepte une abréviation comme préfixe', () => {
    expect(tokenScore('LAIT DEMI ECR', 'Lait demi-écrémé')).toBeGreaterThan(0.8)
  })
  it('donne une note nulle sans mot commun', () => {
    expect(scoreNames('CHOCOLAT NOIR', 'Pain de mie')).toBeLessThan(0.3)
  })
})

describe('matchProducts', () => {
  it('propose le produit le plus proche en premier', () => {
    const [first] = matchProducts('LAIT DEMI ECR BIO', candidates)
    expect(first.candidate.id).toBe(1)
    expect(first.via).toBe('fuzzy')
  })

  it('reconnaît un alias enregistré avec une note de 1', () => {
    const [first] = matchProducts('SAC SOUPLE IM - AFPL', candidates)
    expect(first).toMatchObject({ score: 1, via: 'alias' })
    expect(first.candidate.id).toBe(5)
  })

  it('tolère une lecture OCR abîmée', () => {
    const [first] = matchProducts('YAOS AG NATURE 850G', candidates)
    expect(first.candidate.id).toBe(4)
  })

  it('propose « Lait » pour « Lait dent-écréné bio » (mots en trop sur le ticket)', () => {
    const matches = matchProducts('Lait dent-écréné bio”! 08', [
      ...candidates,
      { id: 8, listId: 'a', text: 'Lait' },
      { id: 9, listId: 'a', text: 'Lait demi-écrémé' },
    ])
    expect(matches[0].candidate.id).toBe(8)
    expect(matches[0].score).toBeGreaterThanOrEqual(0.6)
  })

  it('ne propose pas un produit dont le seul mot court est commun', () => {
    expect(matchProducts('Fromage de chèvre', [{ id: 10, listId: 'a', text: 'Pain de mie' }])).toEqual([])
  })

  it('rapproche un nom court d’un libellé de ticket plus long', () => {
    const [first] = matchProducts('M | LOOK (IMONADE ZERG 1', candidates)
    expect(first.candidate.id).toBe(6)
  })

  it('rapproche une marque lue avec une faute', () => {
    const [first] = matchProducts('CRISTAL INE PACK S0CL', candidates)
    expect(first.candidate.id).toBe(7)
  })

  it('renvoie une liste vide quand rien ne ressemble', () => {
    expect(matchProducts('XQZJ KLMP', candidates)).toEqual([])
  })

  it('limite le nombre de suggestions', () => {
    expect(matchProducts('LAIT PAIN SACS', candidates, { threshold: 0.1, limit: 2 })).toHaveLength(2)
  })

  it('ignore un libellé vide', () => {
    expect(matchProducts('   ', candidates)).toEqual([])
  })
})

describe('searchCandidates', () => {
  it('filtre par mots contenus, sans accents', () => {
    expect(searchCandidates('ecreme', candidates).map((c) => c.id)).toEqual([1])
    expect(searchCandidates('pain mie', candidates).map((c) => c.id)).toEqual([2])
  })
  it('renvoie une liste vide pour une saisie vide', () => {
    expect(searchCandidates('', candidates)).toEqual([])
  })
})
