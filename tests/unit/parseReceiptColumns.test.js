import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseReceiptText } from '@/utils/receipt/parseReceipt.js'
import { summarizeReceipt } from '@/utils/receipt/receiptSummary.js'
import { analyzePasses, mergeDeclared, mostFrequent } from '@/utils/receipt/analyzeReceipt.js'

function fixture(name) {
  return readFileSync(fileURLToPath(new URL(`../fixtures/receipts/${name}`, import.meta.url)), 'utf8')
}

const parseOne = (line) => parseReceiptText(line).products[0]

describe('ticket à colonnes : une ligne « NOM  P.U.  Qté  Total  taxe »', () => {
  it('lit prix unitaire, quantité et total, lettre de taxe « A/T » comprise', () => {
    const p = parseOne('Pain de mie 1,62 1 1,62 A/T')
    expect(p).toMatchObject({ name: 'Pain de mie', quantity: 1, unitCents: 162, totalCents: 162 })
    expect(p.uncertain).toBe(false)
    expect(p.quantityMismatch).toBe(false)
  })

  it('lit une quantité de 2', () => {
    const p = parseOne('Concombre 1,29 2 2,58 A T')
    expect(p).toMatchObject({ name: 'Concombre', quantity: 2, unitCents: 129, totalCents: 258 })
    expect(p.quantityMismatch).toBe(false)
  })

  it('garde dans le nom les nombres qui précèdent les prix (« 2 Kg », « 285g », « x12 »)', () => {
    expect(parseOne('Pomme Golden 2 Kg 2,99 1 2,99 A T').name).toBe('Pomme Golden 2 Kg')
    expect(parseOne('Maïs Bio PNE 285g 1,09 1 1,09 A T').name).toBe('Maïs Bio PNE 285g')
    expect(parseOne('Oeufs Plein Air x12 3,59 1 3,59 A T').name).toBe('Oeufs Plein Air x12')
  })

  it('sépare « 1,642 » en prix unitaire 1,64 et quantité 2, puis recalcule le total illisible', () => {
    const p = parseOne('Boisson noisette bio 1,642 32BAT')
    expect(p).toMatchObject({ quantity: 2, unitCents: 164, totalCents: 328 })
    expect(p.uncertain).toBe(true)
  })

  it('recalcule un total illisible à partir du prix unitaire et de la quantité', () => {
    const p = parseOne('Maïs Bio 1,09 1 100AT')
    expect(p).toMatchObject({ unitCents: 109, quantity: 1, totalCents: 109, uncertain: true })
  })

  it('corrige une quantité mal lue quand le total vaut le prix unitaire', () => {
    const p = parseOne('Orange à jus 2 kg 2,99 4 2,99 A T')
    expect(p).toMatchObject({ quantity: 1, unitCents: 299, totalCents: 299 })
    expect(p.uncertain).toBe(true)
  })

  it('signale un total qui contredit prix unitaire × quantité', () => {
    const p = parseOne('Sauce tomate 0,78 2 1,50 A T')
    expect(p.totalCents).toBe(150)
    expect(p.quantityMismatch).toBe(true)
  })

  it('ignore un signe moins parasite devant un prix de produit', () => {
    expect(parseOne('Flocons d’avoine 0,95 1 -0,95 A T').totalCents).toBe(95)
  })

  it('saute une lettre de taxe isolée au milieu des nombres', () => {
    const p = parseOne('Confi. Bio Myrtilles 1,461 A 4SAT')
    expect(p.name).toBe('Confi. Bio Myrtilles')
    expect(p.unitCents).toBe(146)
  })
})

describe('ligne de quantité au prix unitaire abîmé', () => {
  it('lit la quantité en tête de ligne et le total en fin de ligne', () => {
    const { products } = parseReceiptText('CRISTAL INE PACK S0CL\n4% Ü, 15 EUR 0,64 EUR À')
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ name: 'CRISTAL INE PACK S0CL', quantity: 4, totalCents: 64, unitCents: 16 })
    expect(products[0].uncertain).toBe(true)
  })

  it('ne prend pas « 1kg » en début de ligne pour une quantité', () => {
    const { products } = parseReceiptText('1kg de pommes 2,50 EUR A')
    expect(products[0]).toMatchObject({ quantity: 1, totalCents: 250 })
  })
})

describe('ticket à colonnes : remises et produits au poids', () => {
  it('rattache « Rem Pain -0,40 » au produit précédent', () => {
    const { products } = parseReceiptText('Pain de mie 1,62 1 1,62 A/T\nRem Pain -0,40')
    expect(products).toHaveLength(1)
    expect(products[0].discountCents).toBe(40)
    expect(summarizeReceipt(products).sumCents).toBe(122)
  })

  it('reconnaît « Prix en baisse » comme une remise', () => {
    const { products } = parseReceiptText('Special Flakes Natur 1,99 1 1,99 A T\nPrix en baisse -0,10')
    expect(products).toHaveLength(1)
    expect(products[0].discountCents).toBe(10)
  })

  it('ignore une remise supérieure au prix du produit (chiffre mal lu)', () => {
    const { products } = parseReceiptText('Allumettes de porc 0,95 2 1,90 A T\nPrix en baisse 70,047')
    expect(products[0].discountCents).toBe(0)
  })

  it('lit un produit au poids sur deux lignes : total lu et calcul poids × prix au kilo', () => {
    const { products } = parseReceiptText('Patate douce 1,66 A T\n0,594 kg x 2,79 EUR/kg')
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ totalCents: 166, weightGrams: 594, unitCents: 279 })
    expect(products[0].quantityMismatch).toBe(false)
  })

  it('crée le produit depuis la ligne de poids quand son total n’est pas lisible', () => {
    const { products } = parseReceiptText('Banane Bio fairtrade\n1,104 kg x 2,09 EUR/kg')
    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({ name: 'Banane Bio fairtrade', totalCents: 231, weightGrams: 1104 })
  })

  it('remplace un total abîmé par le calcul poids × prix au kilo', () => {
    const { products } = parseReceiptText('Magret de Canard IGP 7,60AT\n0,356 kg x 21,90 EUR/kg')
    expect(products[0].totalCents).toBe(780)
    expect(products[0].uncertain).toBe(false)
  })
})

describe('ticket à colonnes : zone de totaux', () => {
  const text = [
    'Pain de mie 1,62 1 1,62 A/T',
    'Nombre de lignes: 33',
    'A payer 79,39',
    'Total éligible TR (T) : 78,12',
  ].join('\n')
  const parsed = parseReceiptText(text)

  it('s’arrête avant « Nombre de lignes » et « A payer »', () => {
    expect(parsed.products).toHaveLength(1)
  })

  it('lit le total « A payer » et le nombre de lignes', () => {
    expect(parsed.declaredTotalCents).toBe(7939)
    expect(parsed.declaredLineCount).toBe(33)
  })

  it('compare le nombre de lignes déclaré au nombre de produits', () => {
    const summary = summarizeReceipt(parsed.products, { declaredLineCount: 1 })
    expect(summary.countMatches).toBe(true)
    expect(summary.countKind).toBe('lignes')
  })
})

describe('texte OCR réel d’un ticket à colonnes (photo recadrée et binarisée, PSM 6)', () => {
  const parsed = parseReceiptText(fixture('ticket-colonnes-psm6-recadre.txt'))
  const find = (pattern) => parsed.products.find((p) => pattern.test(p.name))

  it('lit les 33 lignes produits sans remise ni détail de poids parmi elles', () => {
    expect(parsed.products).toHaveLength(33)
    expect(parsed.products.some((p) => /baisse|^Rem\b/i.test(p.name))).toBe(false)
  })

  it('lit juste une vingtaine de totaux sur 33', () => {
    const truth = [
      162, 109, 328, 12, 56, 115, 198, 299, 166, 359, 299, 179, 99, 258, 231, 190, 199, 139, 209, 152,
      352, 359, 90, 95, 780, 379, 276, 276, 78, 109, 659, 145, 648,
    ]
    const pool = [...truth]
    let right = 0
    for (const p of parsed.products) {
      const i = pool.indexOf(p.totalCents)
      if (i >= 0) {
        right++
        pool.splice(i, 1)
      }
    }
    expect(right).toBeGreaterThanOrEqual(24)
  })

  it('rattache les remises aux bons produits', () => {
    expect(find(/Special Flakes/).discountCents).toBe(10)
    expect(find(/Huile/).discountCents).toBe(2)
    expect(find(/Allumettes/).discountCents).toBe(0)
  })

  it('lit les produits au poids avec leur poids', () => {
    expect(find(/Banane/)).toMatchObject({ weightGrams: 1104, totalCents: 231 })
    expect(find(/Magret/)).toMatchObject({ weightGrams: 356, totalCents: 780 })
  })

  it('lit la quantité 2 de la boisson et recalcule son total', () => {
    expect(find(/noiset/i)).toMatchObject({ quantity: 2, unitCents: 164, totalCents: 328 })
  })

  it('signale les montants contradictoires ou incertains', () => {
    expect(find(/Muesli Noisette/).quantityMismatch).toBe(true)
    expect(find(/Thon/).uncertain).toBe(true)
  })
})

describe('analyse combinée de plusieurs passes', () => {
  const rawPasses = [
    { id: 'clean', label: 'Recadré', texts: [fixture('ticket-colonnes-psm6-recadre.txt')] },
    { id: 'original', label: 'Original', texts: [fixture('ticket-colonnes-psm6-original.txt')] },
  ]
  const analysis = analyzePasses(rawPasses)

  it('partage le total lu par une passe avec les autres', () => {
    expect(analysis.declared.declaredTotalCents).toBe(7939)
    for (const pass of analysis.passes) expect(pass.summary.declaredTotalCents).toBe(7939)
  })

  it('retient une des passes avec un motif', () => {
    expect(['clean', 'original']).toContain(analysis.best.id)
    expect(analysis.reason).not.toBe('')
  })

  it('fusionne les photos d’une même passe', () => {
    const merged = analyzePasses([
      {
        id: 'p',
        label: 'P',
        texts: [
          'Pain de mie 1,62 1 1,62 A/T\nConcombre 1,29 2 2,58 A T\nBrocoli 0,99 2 1,98 A T',
          'Concombre 1,29 2 2,58 A T\nBrocoli 0,99 2 1,98 A T\nLimonade 0,56 1 0,56 A T',
        ],
      },
    ])
    expect(merged.passes[0].products.map((p) => p.name)).toEqual(['Pain de mie', 'Concombre', 'Brocoli', 'Limonade'])
  })

  it('renvoie une analyse vide sans passe', () => {
    expect(analyzePasses([])).toMatchObject({ passes: [], best: null })
  })
})

describe('mostFrequent et mergeDeclared', () => {
  it('prend la valeur la plus fréquente, la première à égalité', () => {
    expect(mostFrequent([null, 5, 7, 7])).toBe(7)
    expect(mostFrequent([5, 7])).toBe(5)
    expect(mostFrequent([null, null])).toBeNull()
  })

  it('vote chaque valeur déclarée séparément', () => {
    expect(
      mergeDeclared([
        { declaredTotalCents: null, declaredCount: 14, declaredLineCount: null },
        { declaredTotalCents: 3553, declaredCount: 14, declaredLineCount: 11 },
      ]),
    ).toEqual({ declaredTotalCents: 3553, declaredCount: 14, declaredLineCount: 11 })
  })
})
