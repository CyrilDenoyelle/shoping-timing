/**
 * Analyse des lectures OCR d'un ticket : fusion des photos, parsing de chaque passe,
 * valeurs déclarées (total, nombre d'articles, nombre de lignes) partagées entre les passes,
 * choix de la passe la plus cohérente, puis vote par ligne avec les autres passes. Fonctions pures.
 */

import { consensusProducts } from './consensus.js'
import { mergeReceiptTexts } from './mergePhotos.js'
import { parseReceiptText } from './parseReceipt.js'
import { summarizeReceipt, pickBestPass } from './receiptSummary.js'

/** Valeur non nulle la plus fréquente ; à égalité, la première rencontrée. */
export function mostFrequent(values) {
  const counts = new Map()
  for (const value of values) {
    if (value == null) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let best = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/**
 * Une passe peut manquer le total que la suivante a lu : les valeurs déclarées se votent entre passes.
 * @param {Array<{ declaredTotalCents: number | null, declaredCount: number | null, declaredLineCount: number | null }>} parsedList
 */
export function mergeDeclared(parsedList) {
  return {
    declaredTotalCents: mostFrequent(parsedList.map((p) => p.declaredTotalCents)),
    declaredCount: mostFrequent(parsedList.map((p) => p.declaredCount)),
    declaredLineCount: mostFrequent(parsedList.map((p) => p.declaredLineCount)),
  }
}

/**
 * @param {Array<{ id: string, label: string, texts: string[] }>} rawPasses  un texte par photo, dans l'ordre
 * @returns {{
 *   passes: Array<{ id: string, label: string, text: string, products: Array, summary: ReturnType<typeof summarizeReceipt> }>,
 *   best: object | null,
 *   reason: string,
 *   declared: ReturnType<typeof mergeDeclared>,
 * }}
 */
export function analyzePasses(rawPasses) {
  const parsed = rawPasses.map((pass) => {
    const text = mergeReceiptTexts(pass.texts)
    return { id: pass.id, label: pass.label, text, parsed: parseReceiptText(text) }
  })

  const declared = mergeDeclared(parsed.map((p) => p.parsed))
  const passes = parsed.map((p) => ({
    id: p.id,
    label: p.label,
    text: p.text,
    products: p.parsed.products,
    summary: summarizeReceipt(p.parsed.products, declared),
  }))

  const { best: picked } = pickBestPass(passes)
  if (!picked) return { passes, best: null, reason: 'Aucune lecture disponible.', declared }

  // La passe retenue sert de référence : ses lignes douteuses sont revotées avec les autres passes.
  const ordered = [picked, ...passes.filter((p) => p !== picked)]
  const products = consensusProducts(ordered)
  const best = { ...picked, products, summary: summarizeReceipt(products, declared) }
  const { reason } = pickBestPass([best])

  return { passes, best, reason, declared }
}
