import { STORAGE_KEYS, defaultStorage } from '@/services/storage'
import { generateId } from '@/services/todo/persistence.js'

const MAX_RECEIPTS = 200

export function loadReceipts(storage = defaultStorage) {
  try {
    const parsed = storage.getJson(STORAGE_KEYS.RECEIPTS)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Ajoute un ticket validé (le plus récent en premier) et renvoie l'enregistrement créé. */
export function saveReceipt({ at = Date.now(), totalCents, declaredTotalCents = null, entries }, storage = defaultStorage) {
  const receipt = {
    id: generateId(),
    at,
    totalCents,
    declaredTotalCents,
    entries: entries.map((entry) => ({
      names: entry.names,
      productText: entry.productText,
      listId: entry.listId,
      todoId: entry.todoId,
      quantity: entry.quantity,
      totalCents: entry.totalCents,
    })),
  }
  const next = [receipt, ...loadReceipts(storage)].slice(0, MAX_RECEIPTS)
  if (!storage.setJson(STORAGE_KEYS.RECEIPTS, next)) {
    console.warn('Impossible de sauvegarder le ticket')
  }
  return receipt
}
