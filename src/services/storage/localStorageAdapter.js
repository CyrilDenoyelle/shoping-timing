/**
 * Adaptateur localStorage — implémentation synchrone du contrat StorageAdapter.
 * Pour un backend HTTP : créer apiAdapter.js avec les mêmes méthodes (async si besoin).
 * Pour du temps réel : un adaptateur hybride peut écrire en cache local puis pousser via WebSocket.
 *
 * @typedef {Object} StorageAdapter
 * @property {(key: string, defaultValue?: string|null) => string|null} getString
 * @property {(key: string, value: string) => boolean} setString
 * @property {(key: string, defaultValue?: unknown) => unknown} getJson
 * @property {(key: string, value: unknown) => boolean} setJson
 * @property {(key: string) => boolean} remove
 */

export function createLocalStorageAdapter(backend = localStorage) {
  return {
    getString(key, defaultValue = null) {
      try {
        const value = backend.getItem(key)
        return value ?? defaultValue
      } catch {
        return defaultValue
      }
    },

    setString(key, value) {
      try {
        backend.setItem(key, value)
        return true
      } catch (e) {
        console.warn(`Storage: impossible d'écrire ${key}`, e)
        return false
      }
    },

    getJson(key, defaultValue = null) {
      try {
        const raw = backend.getItem(key)
        if (raw == null) return defaultValue
        return JSON.parse(raw)
      } catch {
        return defaultValue
      }
    },

    setJson(key, value) {
      try {
        backend.setItem(key, JSON.stringify(value))
        return true
      } catch (e) {
        console.warn(`Storage: impossible d'écrire ${key}`, e)
        return false
      }
    },

    remove(key) {
      try {
        backend.removeItem(key)
        return true
      } catch {
        return false
      }
    },
  }
}
