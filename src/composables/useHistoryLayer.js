import { onMounted, onBeforeUnmount } from 'vue'

/**
 * Associe une couche d'interface (visionneuse, fenêtre) à une entrée d'historique du navigateur :
 * le bouton « retour » (mobile ou navigateur) ferme la couche et laisse la page en place.
 *
 * @param {() => void} onDismiss appelé quand la couche doit se fermer
 */
export function useHistoryLayer(onDismiss) {
  let pushed = false

  function onPopState() {
    if (!pushed) return
    pushed = false
    onDismiss()
  }

  /** À appeler à l'ouverture de la couche. */
  function push() {
    if (pushed) return
    history.pushState({ ...history.state, historyLayer: true }, '')
    pushed = true
  }

  /** À appeler pour fermer la couche par l'interface (croix, Échap). */
  function dismiss() {
    if (pushed) history.back()
    else onDismiss()
  }

  onMounted(() => window.addEventListener('popstate', onPopState))
  onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))

  return { push, dismiss }
}
