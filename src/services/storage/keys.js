/** Identifiants de clés — indépendants du backend (localStorage, API, etc.). */
export const STORAGE_KEYS = {
  LISTS: 'shoping-timing-lists',
  LEGACY_TODOS: 'shoping-timing-todos',
  SORT_MODE: 'shoping-timing-sort-mode',
  SHOPPING_MODE: 'shoping-timing-shopping-mode',
  UNDO: 'shoping-timing-undo',
  REDO: 'shoping-timing-redo',
  QUICK_ADD_LIST: 'shoping-timing-quick-add-list',
  SHOPPING_CATEGORY_ORDER: 'shoping-timing-shopping-category-order',
}

/** Anciennes clés du second tri manuel (mode courses), supprimées au démarrage. */
export const LEGACY_SHOPPING_KEYS = [
  'shoping-timing-shopping-order',
  'shoping-timing-shopping-manual-sort',
]

export const MAX_PERSISTED_ACTIONS = 100
