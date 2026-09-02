/**
 * Liste cible de la barre d'ajout rapide.
 *
 * État partagé entre la barre (qui affiche le nom et y ajoute les tâches) et la
 * pile de listes (dont chaque en-tête est cliquable pour devenir la cible).
 * La sélection ne dépend que des clics, ce qui la rend stable pendant le scroll
 * et l'ouverture du clavier.
 */
import { ref } from 'vue'
import { STORAGE_KEYS, defaultStorage } from '@/services/storage'

const PERSIST_DELAY_MS = 400

const selectedListId = ref(null)
let persistTimer = null
let initialized = false

function persist(id, storage) {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    storage.setString(STORAGE_KEYS.QUICK_ADD_LIST, id)
  }, PERSIST_DELAY_MS)
}

export function useSelectedList(storage = defaultStorage) {
  if (!initialized) {
    initialized = true
    selectedListId.value = storage.getString(STORAGE_KEYS.QUICK_ADD_LIST)
  }

  const selectList = (id) => {
    if (!id || id === selectedListId.value) return
    selectedListId.value = id
    persist(id, storage)
  }

  /** Retombe sur la première liste quand la sélection courante n'existe plus. */
  const ensureValidSelection = (lists) => {
    if (lists.some((l) => l.id === selectedListId.value)) return
    const fallback = lists[0]?.id ?? null
    selectedListId.value = fallback
    if (fallback) persist(fallback, storage)
  }

  return { selectedListId, selectList, ensureValidSelection }
}
