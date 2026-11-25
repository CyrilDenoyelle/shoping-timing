import { describe, it, expect, vi } from 'vitest'
import {
  suggestProductName,
  buildReviewLines,
  isLineReady,
  canValidate,
  receiptTotalCents,
  validateReviewLines,
  existingTarget,
  newTarget,
  pendingProductCandidates,
  mergeReviewCandidates,
  targetFromCandidate,
  setLineQuantity,
  setLineUnit,
  setLineTotal,
  parseEuroInput,
  lineNetCents,
  lineIssues,
  reviewIssues,
} from '@/utils/receipt/reviewLines.js'

const candidates = [
  { id: 1, listId: 'a', text: 'Lait demi-écrémé', receiptNames: [] },
  { id: 2, listId: 'a', text: 'Pain de mie', receiptNames: [] },
]

const product = (name, totalCents, extra = {}) => ({
  name,
  quantity: 1,
  unitCents: totalCents,
  totalCents,
  discountCents: 0,
  ...extra,
})

describe('suggestProductName', () => {
  it('met en forme un libellé en majuscules', () => {
    expect(suggestProductName('CHARAL HACHE OIGNON 850G')).toBe('Charal hache oignon')
  })
  it('garde la casse d’un libellé déjà mixte', () => {
    expect(suggestProductName('Maïs Bio')).toBe('Maïs Bio')
  })
  it('retire la ponctuation de bord', () => {
    expect(suggestProductName('| LIMONADE ZERO.')).toBe('Limonade zero')
  })
  it('renvoie une chaîne vide pour un libellé illisible', () => {
    expect(suggestProductName('@@ 1')).toBe('')
  })
})

describe('buildReviewLines', () => {
  it('rattache automatiquement un produit reconnu', () => {
    const [line] = buildReviewLines([product('LAIT DEMI ECR', 120)], candidates, { defaultListId: 'a' })
    expect(line.target).toMatchObject({ type: 'existing', todoId: 1 })
    expect(line.suggestions[0].candidate.id).toBe(1)
  })

  it('propose plusieurs produits proches, classés par ressemblance', () => {
    const many = [
      { id: 10, listId: 'a', text: 'Lait', receiptNames: [] },
      { id: 11, listId: 'a', text: 'Lait demi-écrémé', receiptNames: [] },
      { id: 12, listId: 'a', text: 'Lait de coco', receiptNames: [] },
      { id: 13, listId: 'a', text: 'Lait d’avoine', receiptNames: [] },
      { id: 14, listId: 'a', text: 'Yaourt nature', receiptNames: [] },
    ]
    const [line] = buildReviewLines([product('LAIT DEMI ECR BIO', 120)], many)
    const ids = line.suggestions.map((s) => s.candidate.id)
    expect(ids.length).toBeGreaterThanOrEqual(3)
    expect(ids[0]).toBe(11)
    expect(ids).toContain(10)
    expect(ids).not.toContain(14)
    const scores = line.suggestions.map((s) => s.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it('propose un nouveau produit pour un libellé inconnu', () => {
    const [line] = buildReviewLines([product('CHOCOLAT NOIR', 200)], candidates, { defaultListId: 'b' })
    expect(line.target).toEqual({ type: 'new', listId: 'b', text: 'Chocolat noir' })
  })

  it('affiche le total lu et garde la remise à part', () => {
    const [line] = buildReviewLines([product('PAIN DE MIE', 199, { discountCents: 10 })], candidates)
    expect(line.totalCents).toBe(199)
    expect(line.discountCents).toBe(10)
    expect(lineNetCents(line)).toBe(189)
  })

  it('marque les lignes incertaines', () => {
    const [line] = buildReviewLines([product('PAIN DE MIE', 199, { uncertain: true })], candidates)
    expect(line.uncertain).toBe(true)
  })

  it('agglomère deux lignes OCR vers le même nouveau produit', () => {
    const lines = buildReviewLines(
      [product('SOD SDW SUED JAMB CH', 231), product('SOD SDW SUED JAMB CH', 203)],
      [],
      { defaultListId: 'a', lists: [{ id: 'a', name: 'Manger' }] },
    )
    expect(lines[0].target.type).toBe('new')
    expect(lines[1].target).toMatchObject({
      type: 'new',
      listId: 'a',
      text: lines[0].target.text,
    })
  })

  it('rattache une 2e ligne via l’alias OCR du brouillon précédent', () => {
    const lines = buildReviewLines(
      [product('SOD SDW SUED JAMB CH', 231), product('SOD SDW SUED JAMBE CH', 203)],
      [],
      { defaultListId: 'a', lists: [{ id: 'a', name: 'Manger' }] },
    )
    expect(lines[1].target.text).toBe(lines[0].target.text)
  })
})

describe('brouillons de nouveaux produits entre lignes', () => {
  const lists = [{ id: 'a', name: 'Manger' }]

  it('expose les noms saisis sur le ticket comme candidats « nouveau »', () => {
    const lines = [
      {
        included: true,
        name: 'SOD SDW A',
        target: newTarget('a', 'Sandwich triangle'),
      },
      {
        included: true,
        name: 'SOD SDW B',
        target: newTarget('a', 'Sandwich triangle'),
      },
    ]
    const pending = pendingProductCandidates(lines, lists)
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      text: 'Sandwich triangle',
      pending: true,
      listName: 'Manger',
    })
    expect(pending[0].receiptNames).toEqual(['SOD SDW A', 'SOD SDW B'])
  })

  it('ajoute les brouillons aux produits existants pour l’autocomplétion', () => {
    const lines = [{ included: true, name: 'X', target: newTarget('a', 'Sandwich triangle') }]
    const merged = mergeReviewCandidates(candidates, lines, lists)
    expect(merged.some((c) => c.pending && c.text === 'Sandwich triangle')).toBe(true)
    expect(merged.some((c) => c.id === 1)).toBe(true)
  })

  it('crée une cible « nouveau » depuis un candidat brouillon', () => {
    expect(targetFromCandidate({ pending: true, listId: 'a', text: 'Sandwich triangle' })).toEqual({
      type: 'new',
      listId: 'a',
      text: 'Sandwich triangle',
    })
  })

  it('regroupe à la validation deux lignes vers le même nouveau produit', () => {
    const api = {
      addTodo: vi.fn(() => ({ id: 50 })),
      addReceiptName: vi.fn(),
      applyReceiptPurchase: vi.fn(() => 'check'),
    }
    const report = validateReviewLines(
      [
        {
          included: true,
          name: 'A',
          quantity: 1,
          totalCents: 100,
          discountCents: 0,
          target: newTarget('a', 'Sandwich triangle'),
        },
        {
          included: true,
          name: 'B',
          quantity: 1,
          totalCents: 200,
          discountCents: 0,
          target: newTarget('a', 'sandwich triangle'),
        },
      ],
      api,
    )
    expect(api.addTodo).toHaveBeenCalledTimes(1)
    expect(report.created).toBe(1)
    expect(report.entries[0]).toMatchObject({ quantity: 2, totalCents: 300 })
    expect(api.addReceiptName).toHaveBeenCalledWith('a', 50, 'A')
    expect(api.addReceiptName).toHaveBeenCalledWith('a', 50, 'B')
  })
})

describe('édition des montants', () => {
  const make = () => ({ included: true, quantity: 2, unitCents: 150, totalCents: 300 })

  it('édite la quantité sans toucher aux montants', () => {
    const line = make()
    setLineQuantity(line, 3)
    expect(line).toMatchObject({ quantity: 3, unitCents: 150, totalCents: 300 })
    expect(lineIssues(line).amounts).toBe(true)
  })
  it('édite le prix unitaire sans toucher au total', () => {
    const line = make()
    setLineUnit(line, 200)
    expect(line).toMatchObject({ unitCents: 200, totalCents: 300 })
    expect(lineIssues(line).amounts).toBe(true)
  })
  it('édite le total sans toucher au prix unitaire', () => {
    const line = make()
    setLineTotal(line, 360)
    expect(line).toMatchObject({ unitCents: 150, totalCents: 360 })
    expect(lineIssues(line).amounts).toBe(true)
  })
  it('ramène une quantité invalide à 1', () => {
    const line = make()
    setLineQuantity(line, 0)
    expect(line.quantity).toBe(1)
  })
  it('efface le rouge dès que quantité × unitaire = total', () => {
    const line = make()
    setLineQuantity(line, 3)
    setLineTotal(line, 450)
    expect(lineIssues(line).amounts).toBe(false)
  })
  it('lit une saisie en euros avec virgule', () => {
    expect(parseEuroInput('1,45')).toBe(145)
    expect(parseEuroInput('abc')).toBe(0)
  })
  it('renseigne le prix unitaire des lignes construites', () => {
    const [line] = buildReviewLines([product('PAIN', 300, { quantity: 2, unitCents: 150 })], candidates)
    expect(line.unitCents).toBe(150)
  })

  it('garde le prix unitaire lu quand il colle au total', () => {
    const [line] = buildReviewLines([product('LAIT', 328, { quantity: 2, unitCents: 164 })], candidates)
    expect(line.unitCents).toBe(164)
  })

  it('affiche le prix unitaire lu même quand il ne colle pas au total', () => {
    const [line] = buildReviewLines([product('LAIT', 328, { quantity: 2, unitCents: 300 })], candidates)
    expect(line.unitCents).toBe(300)
    expect(lineIssues(line).amounts).toBe(true)
  })

  it('déduit le prix unitaire quand il est absent', () => {
    const [line] = buildReviewLines([product('LAIT', 328, { quantity: 2, unitCents: 0 })], candidates)
    expect(line.unitCents).toBe(164)
  })

  it('ne prend pas le prix au kilo pour un produit au poids', () => {
    const [line] = buildReviewLines(
      [product('POMMES', 259, { quantity: 1, unitCents: 299, weightGrams: 866 })],
      candidates,
    )
    expect(line.unitCents).toBe(259)
  })

  it('garde le prix unitaire lu quand il y a une remise, sans incohérence', () => {
    const [line] = buildReviewLines([product('PAIN', 199, { quantity: 1, unitCents: 199, discountCents: 10 })], candidates)
    expect(line.unitCents).toBe(199)
    expect(lineIssues(line).amounts).toBe(false)
  })
})

describe('incohérences affichées en rouge', () => {
  const ok = (extra = {}) => ({
    key: 1,
    included: true,
    quantity: 2,
    unitCents: 164,
    totalCents: 328,
    discountCents: 0,
    weightGrams: null,
    target: existingTarget(candidates[0]),
    ...extra,
  })

  it('accepte une ligne cohérente', () => {
    expect(lineIssues(ok())).toEqual({ amounts: false, product: false })
  })
  it('tolère un centime d’arrondi par article', () => {
    expect(lineIssues(ok({ unitCents: 164, totalCents: 329 })).amounts).toBe(false)
    expect(lineIssues(ok({ unitCents: 164, totalCents: 331 })).amounts).toBe(true)
  })
  it('signale un total absent', () => {
    expect(lineIssues(ok({ totalCents: 0 })).amounts).toBe(true)
  })
  it('signale un produit manquant', () => {
    expect(lineIssues(ok({ target: newTarget('a', '') })).product).toBe(true)
  })
  it('ne contrôle pas une ligne ignorée', () => {
    expect(lineIssues(ok({ included: false, totalCents: 0, target: null }))).toEqual({
      amounts: false,
      product: false,
    })
  })
  it('contrôle une ligne au poids sur son seul total', () => {
    expect(lineIssues(ok({ weightGrams: 866, quantity: 1, unitCents: 259, totalCents: 259 })).amounts).toBe(false)
  })

  describe('reviewIssues', () => {
    it('ne signale rien quand tout est cohérent', () => {
      const result = reviewIssues([ok()], 328)
      expect(result).toMatchObject({ hasIssues: false, gap: false, messages: [] })
    })
    it('liste les lignes incohérentes', () => {
      const result = reviewIssues([ok(), ok({ key: 2, totalCents: 0 })], null)
      expect(result.amountKeys).toEqual([2])
      expect(result.hasIssues).toBe(true)
    })
    it('signale un écart avec le total du ticket', () => {
      const result = reviewIssues([ok()], 400)
      expect(result.gap).toBe(true)
      expect(result.gapCents).toBe(-72)
      expect(result.messages.join(' ')).toContain('3,28 €')
    })
    it('ignore l’écart quand le total du ticket est inconnu', () => {
      expect(reviewIssues([ok()], null).gap).toBe(false)
    })
    it('retranche la remise du total des lignes', () => {
      const result = reviewIssues([ok({ quantity: 1, unitCents: 199, totalCents: 199, discountCents: 10 })], 189)
      expect(result.gap).toBe(false)
    })
    it('liste les lignes sans produit', () => {
      const result = reviewIssues([ok({ key: 5, target: null })], null)
      expect(result.productKeys).toEqual([5])
    })
  })
})

describe('contrôle de la revue', () => {
  const base = { included: true, target: existingTarget(candidates[0]), totalCents: 100 }

  it('accepte une ligne avec un produit existant', () => {
    expect(isLineReady(base)).toBe(true)
  })
  it('refuse un nouveau produit sans nom', () => {
    expect(isLineReady({ ...base, target: newTarget('a', '  ') })).toBe(false)
  })
  it('ignore les lignes décochées', () => {
    expect(isLineReady({ ...base, included: false, target: null })).toBe(true)
  })
  it('exige au moins une ligne retenue', () => {
    expect(canValidate([{ ...base, included: false }])).toBe(false)
    expect(canValidate([base])).toBe(true)
  })
  it('totalise les lignes retenues', () => {
    expect(receiptTotalCents([base, { ...base, included: false }, { ...base, totalCents: 250 }])).toBe(350)
  })
})

describe('validateReviewLines', () => {
  function fakeApi(actions = {}) {
    let nextId = 100
    return {
      addTodo: vi.fn(() => ({ id: nextId++ })),
      addReceiptName: vi.fn(),
      applyReceiptPurchase: vi.fn((listId, id) => actions[id] ?? 'check'),
    }
  }

  const line = (name, target, extra = {}) => ({
    name,
    included: true,
    quantity: 1,
    totalCents: 100,
    target,
    ...extra,
  })

  it('crée les nouveaux produits et enregistre leur achat', () => {
    const api = fakeApi()
    const report = validateReviewLines([line('CHOCO', newTarget('a', 'Chocolat'))], api, 5)
    expect(api.addTodo).toHaveBeenCalledWith('a', 'Chocolat')
    expect(api.addReceiptName).toHaveBeenCalledWith('a', 100, 'CHOCO')
    expect(api.applyReceiptPurchase).toHaveBeenCalledWith('a', 100, { quantity: 1, at: 5 })
    expect(report).toMatchObject({ created: 1, checked: 1, totalCents: 100 })
  })

  it('compte les actions retournées par le stockage', () => {
    const api = fakeApi({ 1: 'record', 2: 'skip' })
    const report = validateReviewLines(
      [line('LAIT', existingTarget(candidates[0])), line('PAIN', existingTarget(candidates[1]))],
      api,
    )
    expect(report).toMatchObject({ checked: 0, recorded: 1, skipped: 1, created: 0 })
    expect(api.addTodo).not.toHaveBeenCalled()
  })

  it('regroupe deux lignes vers le même produit', () => {
    const api = fakeApi()
    const report = validateReviewLines(
      [
        line('LAIT A', existingTarget(candidates[0]), { quantity: 2, totalCents: 200 }),
        line('LAIT B', existingTarget(candidates[0]), { quantity: 1, totalCents: 90 }),
      ],
      api,
    )
    expect(api.applyReceiptPurchase).toHaveBeenCalledTimes(1)
    expect(api.applyReceiptPurchase).toHaveBeenCalledWith('a', 1, { quantity: 3, at: expect.any(Number) })
    expect(api.addReceiptName).toHaveBeenCalledTimes(2)
    expect(report.entries[0]).toMatchObject({ quantity: 3, totalCents: 290 })
  })

  it('crée une seule fois un nouveau produit présent sur deux lignes', () => {
    const api = fakeApi()
    validateReviewLines(
      [line('MUESLI A', newTarget('a', 'Muesli')), line('MUESLI B', newTarget('a', 'muesli'))],
      api,
    )
    expect(api.addTodo).toHaveBeenCalledTimes(1)
  })

  it('compte les lignes ignorées', () => {
    const api = fakeApi()
    const report = validateReviewLines(
      [line('A', existingTarget(candidates[0]), { included: false }), line('B', existingTarget(candidates[1]))],
      api,
    )
    expect(report.ignored).toBe(1)
    expect(report.entries).toHaveLength(1)
  })
})
