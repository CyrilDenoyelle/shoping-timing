import { describe, it, expect } from 'vitest'
import { parseReceiptText } from '@/utils/receipt/parseReceipt.js'
import { summarizeReceipt, pickBestPass } from '@/utils/receipt/receiptSummary.js'

// Textes OCR réels, copiés depuis la page de test (photo d'origine, prétraitement activé).

const PSM4_TEXT = `Intermarché
JAS MATESTRO
nu dit Condamine
Koute du Lauragals
150 POMPERTUZAT
Jl 1.46.1€,20
SIkf1: &3480420100013
8 OR TUILE GOUT BARB      1,45 EUR À
LOOK LIMONADE ZER          0,6) EUR À
CHARAL HA            9,84 EUR À
YAOS \\AG NATURE           3,13 EUR À
SAC SOUPLE IM - AF        0,12 EUR B
CRISTAL INE PACK 50CL
LX D,10 EUR         0,64 EUR À
SIN TABS TT1 CITRON       7,79 EUR B
SOD SDW SUED JAMB CH     2, EUR E
Sim SUED PLT TAN     2,03 EUR E
SDW TG XXL 5Ù J      2,19 EUR E
720 C 4 FROMAG      4,78 EUR À
CB 5
Nombre “l'artisles vendus= 14
TOTAL 00e TFD        27,62 EUR`

const PSM6_TEXT = `Intermarché
JAS MATESTRO
nu dit Condamine
Koute du Lauragals
150 POMPERTUZAI
5.61.46.16,20
<Ikf!; €3=80420100013
3 OR TUILE GOUT BARB      1,45 EUR À
LOOK LIMOHADE lERÜ 1      0,6) EUR À
CHARAL HACHE OIGNON    9,84 EUR À
YAOS YAG NATURE 350G      3,13 EUR À
SAC SOUPLE IM - AFPI    0,12 EUR B
CRISTAL INE PACK 50CL
4 K 1,15 EUR       0,64 EUR À
SIN TABS TT1 CITRON       7,79 EUR B
SOD SDW SUED JAMB CH     2,31 EUR |=
SOD Si SUED PLT TAN      2,03 EUR E
DAUN SDW TG XXL 5Ù J      2,19 EUR E
SD P}ZA C 4 FROMAG      4,783 EUR À
MOHTANT OÙ          35,53 EUR
3  \\10E=1Vicgnette
3 Total Vign. GALIMARD
CB SANS CONTACT         35,53 EUR
Nombre d'articles vendus= 14
TOTAL ELIGIBLE TRD        27,62 EUR`

describe('texte OCR réel, passe PSM 6 (MOHTANT, « 4 K », décimales parasites)', () => {
  const parsed = parseReceiptText(PSM6_TEXT)
  const summary = summarizeReceipt(parsed.products, parsed)

  it('s’arrête au total même lorsque MONTANT est lu MOHTANT', () => {
    expect(parsed.products.some((p) => /TANT/i.test(p.name))).toBe(false)
    expect(parsed.declaredTotalCents).toBe(3553)
  })

  it('lit le nombre d’articles déclaré et retrouve 14 articles', () => {
    expect(parsed.declaredCount).toBe(14)
    expect(summary.articleCount).toBe(14)
    expect(summary.countMatches).toBe(true)
  })

  it('garde les lignes avec un trait parasite en fin de prix (« 2,31 EUR |= »)', () => {
    const jamb = parsed.products.find((p) => /JAMB/i.test(p.name))
    expect(jamb.totalCents).toBe(231)
  })

  it('arrondit un prix à 3 décimales en le signalant comme incertain', () => {
    const pizza = parsed.products.find((p) => /PIZZA|FROMAG|P}ZA/i.test(p.name))
    expect(pizza.totalCents).toBe(478)
    expect(pizza.uncertain).toBe(true)
  })

  it('remplace le nom « 4 K 1,15 EUR » par le nom du produit précédent', () => {
    const cristaline = parsed.products.find((p) => /CRISTAL/i.test(p.name))
    expect(cristaline.name).toBe('CRISTAL INE PACK 50CL')
    expect(cristaline.quantity).toBe(4)
    expect(cristaline.quantityMismatch).toBe(true)
  })

  it('laisse un écart de 0,65 € : des chiffres mal lus restent à corriger', () => {
    expect(summary.sumCents).toBe(3488)
    expect(summary.differenceCents).toBe(65)
    expect(summary.totalMatches).toBe(false)
  })
})

describe('texte OCR réel, passe PSM 4 (total absent, « artisles »)', () => {
  const parsed = parseReceiptText(PSM4_TEXT)
  const summary = summarizeReceipt(parsed.products, parsed)

  it('ne trouve pas de total et le signale', () => {
    expect(parsed.declaredTotalCents).toBeNull()
    expect(summary.differenceCents).toBeNull()
  })

  it('lit le nombre d’articles malgré « artisles »', () => {
    expect(parsed.declaredCount).toBe(14)
  })

  it('remplace le nom garbled « LX D,10 EUR » par le nom précédent', () => {
    const cristaline = parsed.products.find((p) => /CRISTAL/i.test(p.name))
    expect(cristaline.totalCents).toBe(64)
    expect(parsed.products.some((p) => /D,10/.test(p.name))).toBe(false)
  })
})

describe('choix de la passe sur ces deux textes', () => {
  it('retient PSM 6, car il possède un total exploitable', () => {
    const p4 = parseReceiptText(PSM4_TEXT)
    const p6 = parseReceiptText(PSM6_TEXT)
    const { best, reason } = pickBestPass([
      { id: 'column', label: 'PSM 4', products: p4.products, summary: summarizeReceipt(p4.products, p4) },
      { id: 'block', label: 'PSM 6', products: p6.products, summary: summarizeReceipt(p6.products, p6) },
    ])
    expect(best.id).toBe('block')
    expect(reason).toBe('Nombre d’articles cohérent, total à vérifier.')
  })
})
