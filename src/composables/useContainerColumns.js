import { ref, onMounted, onBeforeUnmount } from 'vue'
import { columnsForWidth } from '@/utils/stats/gridLayout.js'

/**
 * Nombre maximal de colonnes de cartes qui tiennent dans un conteneur, mis à jour quand il se redimensionne.
 * @param {import('vue').Ref<HTMLElement | null>} elRef élément dont la largeur de contenu est mesurée
 * @param {{ minColumnWidth?: number, gap?: number, maxColumns?: number }} [options]
 */
export function useContainerColumns(elRef, options = {}) {
  const columns = ref(1)
  let observer = null

  const update = (width) => {
    columns.value = columnsForWidth(width, options)
  }

  onMounted(() => {
    const el = elRef.value
    if (!el) return
    update(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) update(entry.contentRect.width)
    })
    observer.observe(el)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return columns
}
