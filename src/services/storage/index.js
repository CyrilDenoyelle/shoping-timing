import { createLocalStorageAdapter } from './localStorageAdapter.js'

export { STORAGE_KEYS, MAX_PERSISTED_ACTIONS } from './keys.js'
export { createLocalStorageAdapter } from './localStorageAdapter.js'

/** Instance par défaut. Injecter un autre adaptateur dans useTodoStorage() pour les tests ou un futur backend. */
export const defaultStorage = createLocalStorageAdapter()
