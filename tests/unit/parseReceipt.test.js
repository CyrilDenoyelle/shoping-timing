import { describe, it, expect } from 'vitest'
import { parseReceiptText, toCents } from '@/utils/receipt/parseReceipt.js'
import { summarizeReceipt, pickBestPass } from '@/utils/receipt/receiptSummary.js'

// Texte OCR réel (PSM 6) d'une photo d'origine 2268 x 4032 px, jusqu'à la zone de totaux.
const PSM6_TEXT = `Intermarché
JAS MATESTRO
» dit Concdamine
foute du Lauragais
1450 POMPERTUZAI
15,61.46,1E,20
<Ikf1: E3:80420100013
B OR TJILE GOUT BARB     1,45 EUR À
LOOK | IMONADE ZERO 1      0,6/) EUR À
CHARAL HACHE OTGNON       9,84 EUR À
YAOS VAG NATURE 350G      3,13 EUR À
SAC SOUPLE IM - AFPL      0,12 EUR B
CRISTAL INÉ PACK 50CL
4 x 0,15 EUR         0,64 EUR À
SIN TH3S TT1 CITRÜN       7,19 EUR B
SOD SDW SUED JAMB CH     2,41 EUR E
SOD 5 SUED PLT TAN      2,05 EUR E
DAUN SDW TG XXL 3 J      2,19 EUR E
S0D P}/2A C4 FROMAG      4,73 EUR À
MOITANT OÙ         35,53 EUR
3 TOE=1Vicnette
CB SANS CONTACT         35,53 EUR
Nombre «d'articles vendus= 14`

describe('toCents', () => {
  it('convertit un montant français en centimes', () => {
    expect(toCents('35,53')).toBe(3553)
    expect(toCents('0.64')).toBe(64)
  })
})

describe('parseReceiptText', () => {
  const parsed = parseReceiptText(PSM6_TEXT)

  it('lit les produits sans les lignes d’en-tête ni de totaux', () => {
    expect(parsed.products).toHaveLength(11)
    expect(parsed.products.map((p) => p.name)).not.toContain('Intermarché')
    expect(parsed.products.some((p) => /MOITANT|CONTACT/i.test(p.name))).toBe(false)
  })

  it('lit le total et le nombre d’articles déclarés', () => {
    expect(parsed.declaredTotalCents).toBe(3553)
    expect(parsed.declaredCount).toBe(14)
  })

  it('préfère le montant de la ligne CB au total « MONTANT » mal lu', () => {
    const text = 'CHARAL HACHE OIGNON 9,84 EUR A\nMONTANT D d9,33 EU\nCB SANS CONTACT 35,53 EUR'
    expect(parseReceiptText(text).declaredTotalCents).toBe(3553)
  })

  it('rattache la ligne « 4 x prix » au produit précédent', () => {
    const cristaline = parsed.products.find((p) => /CRISTAL/i.test(p.name))
    expect(cristaline.quantity).toBe(4)
    expect(cristaline.unitCents).toBe(15)
    expect(cristaline.totalCents).toBe(64)
  })

  it('signale une multiplication incohérente (4 x 0,15 ≠ 0,64)', () => {
    const cristaline = parsed.products.find((p) => /CRISTAL/i.test(p.name))
    expect(cristaline.quantityMismatch).toBe(true)
  })

  it('signale un prix lu avec un seul décimal', () => {
    const limonade = parsed.products.find((p) => /IMONADE/i.test(p.name))
    expect(limonade.uncertain).toBe(true)
  })

  it('retire la lettre de taxe en fin de ligne', () => {
    const sac = parsed.products.find((p) => /SAC/i.test(p.name))
    expect(sac.totalCents).toBe(12)
    expect(sac.name).toBe('SAC SOUPLE IM - AFPL')
  })
})

describe('summarizeReceipt et pickBestPass', () => {
  const parsed = parseReceiptText(PSM6_TEXT)
  const summary = summarizeReceipt(parsed.products, parsed)

  it('calcule la somme des lignes et l’écart avec le total', () => {
    expect(summary.sumCents).toBe(3435)
    expect(summary.differenceCents).toBe(118)
    expect(summary.totalMatches).toBe(false)
  })

  it('confirme le nombre d’articles', () => {
    expect(summary.articleCount).toBe(14)
    expect(summary.countMatches).toBe(true)
  })

  it('préfère la lecture qui satisfait le total', () => {
    const wrong = summarizeReceipt(parsed.products.slice(0, 3), { declaredTotalCents: 3553, declaredCount: 14 })
    const right = summarizeReceipt(parsed.products, { declaredTotalCents: 3435, declaredCount: 14 })
    const { best } = pickBestPass([
      { id: 'wrong', label: 'A', products: [], summary: wrong },
      { id: 'right', label: 'B', products: parsed.products, summary: right },
    ])
    expect(best.id).toBe('right')
  })
})
