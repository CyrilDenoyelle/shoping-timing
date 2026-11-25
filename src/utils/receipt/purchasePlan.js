/** Règles d'enregistrement d'un achat lu sur un ticket. */

export const PURCHASE_ACTIONS = Object.freeze({
  /** Produit à acheter : il est coché. */
  CHECK: 'check',
  /** Produit coché depuis un jour précédent : décoché puis recoché pour dater un nouvel achat. */
  RECORD: 'record',
  /** Produit déjà acheté aujourd'hui : rien à faire. */
  SKIP: 'skip',
})

function isSameDay(a, b) {
  const first = new Date(a)
  const second = new Date(b)
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

/** Vrai quand le dernier achat enregistré du produit date du jour de `now`. */
export function isBoughtToday(todo, now = Date.now()) {
  if (!todo?.done) return false
  const last = todo.timings?.[todo.timings.length - 1]
  return last?.end != null && isSameDay(last.end, now)
}

export function planReceiptPurchase(todo, now = Date.now()) {
  if (!todo.done) return PURCHASE_ACTIONS.CHECK
  if (isBoughtToday(todo, now)) return PURCHASE_ACTIONS.SKIP
  return PURCHASE_ACTIONS.RECORD
}
