/**
 * Sélection de liste liée au scroll — mapping bidirectionnel unique.
 *
 * Scroll → liste :
 *   t = scrollY / maxScroll              (0 en haut, 1 en bas)
 *   offsetViewport = readingTop + t × readingHeight
 *     (readingTop = bas de la barre sticky, readingHeight = zone visible restante)
 *   focusY = scrollY + offsetViewport
 *   stackPos = focusY − rangeTop           (clampé dans la pile)
 *
 * Liste → scroll (dropdown) :
 *   t_list = position de la liste dans la pile (0 → 1, haut → bas)
 *   focusY cible = listTop + t_list × listHeight
 *   scrollY = (focusY − readingTop) / (1 + readingHeight / maxScroll) (clampé)
 */
import { onMounted, onBeforeUnmount } from 'vue'

const SCROLL_ANCHOR_SELECTOR = '[data-scroll-list-picker-anchor]'

function getSections() {
  return [...document.querySelectorAll('[data-list-id]')]
}

/** Bas viewport (px) de la barre sticky — début de la zone de lecture. */
function measureReadingTop() {
  const anchor = document.querySelector(SCROLL_ANCHOR_SELECTOR)
  if (!anchor) return 0
  return anchor.getBoundingClientRect().bottom
}

function scrollT(scrollY, maxScroll) {
  if (maxScroll <= 0) return 0
  return Math.min(1, Math.max(0, scrollY / maxScroll))
}

/** Mesure la pile de listes (positions document, indépendantes du scroll). */
export function measureListLayout() {
  const sections = getSections()
  if (!sections.length) return null

  const scrollY = window.scrollY
  const bounds = sections.map((section) => {
    const rect = section.getBoundingClientRect()
    const top = rect.top + scrollY
    return { id: section.dataset.listId, top, span: rect.height }
  })

  const rangeTop = bounds[0].top
  const rangeBottom = bounds[bounds.length - 1].top + bounds[bounds.length - 1].span
  const totalSpan = bounds.reduce((sum, b) => sum + b.span, 0)
  const range = rangeBottom - rangeTop
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  )
  const viewportH = window.innerHeight
  const readingTop = measureReadingTop()
  const readingHeight = Math.max(0, viewportH - readingTop)

  return {
    bounds,
    rangeTop,
    rangeBottom,
    range,
    totalSpan,
    maxScroll,
    viewportH,
    readingTop,
    readingHeight,
  }
}

/**
 * Position t de la liste dans la pile (0 = tout en haut, 1 = tout en bas).
 * Basé sur le centre vertical de la section dans l'étendue document.
 */
export function listPositionT(bound, layout) {
  const { range, rangeTop } = layout
  if (range <= 0) return 0.5
  const center = bound.top + bound.span / 2
  return Math.min(1, Math.max(0, (center - rangeTop) / range))
}

/** focusY cible pour centrer la liste dans le mapping scroll ↔ pile. */
export function focusYTargetForList(bound, layout) {
  const t = listPositionT(bound, layout)
  return bound.top + t * bound.span
}

/** Ligne de lecture dans le document, sous la barre sticky. */
export function focusYFromScroll(scrollY, layout) {
  const { maxScroll, viewportH, readingTop, readingHeight } = layout
  const t = scrollT(scrollY, maxScroll)
  if (readingHeight <= 0) return scrollY + t * viewportH
  return scrollY + readingTop + t * readingHeight
}

/** Position le long de la pile (0 … totalSpan) pour un scrollY donné. */
export function stackPosFromScrollY(scrollY, layout) {
  const { rangeTop, totalSpan } = layout
  if (totalSpan <= 0) return 0
  const focus = focusYFromScroll(scrollY, layout)
  return Math.min(totalSpan, Math.max(0, focus - rangeTop))
}

/** scrollY qui amène focusY le plus près possible de la cible (clamp si nécessaire). */
export function scrollYFromFocusY(focusY, layout) {
  const { maxScroll, viewportH, readingTop, readingHeight } = layout
  if (maxScroll <= 0) return 0
  if (readingHeight <= 0) {
    return Math.min(maxScroll, Math.max(0, focusY / (1 + viewportH / maxScroll)))
  }
  const factor = 1 + readingHeight / maxScroll
  return Math.min(maxScroll, Math.max(0, (focusY - readingTop) / factor))
}

/** Id de la liste à la position donnée dans la pile (hauteurs proportionnelles). */
export function listIdAtStackPos(stackPos, bounds) {
  let remaining = stackPos
  for (let i = 0; i < bounds.length; i++) {
    if (remaining < bounds[i].span || i === bounds.length - 1) {
      return bounds[i].id
    }
    remaining -= bounds[i].span
  }
  return bounds[bounds.length - 1].id
}

export function listIdFromScrollPosition(scrollY = window.scrollY) {
  const layout = measureListLayout()
  if (!layout) return null
  if (layout.bounds.length === 1) return layout.bounds[0].id

  const stackPos = stackPosFromScrollY(scrollY, layout)
  return listIdAtStackPos(stackPos, layout.bounds)
}

export function scrollYForList(listId) {
  const layout = measureListLayout()
  if (!layout) return null

  const bound = layout.bounds.find((b) => b.id === listId)
  if (!bound) return null

  return scrollYFromFocusY(focusYTargetForList(bound, layout), layout)
}

/** Fait défiler jusqu'à la section liste (inverse exact de listIdFromScrollPosition). */
export function scrollToList(listId, onDone) {
  const top = scrollYForList(listId)
  if (top == null) {
    onDone?.()
    return
  }

  window.scrollTo({ top, behavior: 'smooth' })

  if (!onDone) return

  let done = false
  const finish = () => {
    if (done) return
    done = true
    window.removeEventListener('scrollend', finish)
    clearTimeout(fallback)
    onDone()
  }
  window.addEventListener('scrollend', finish, { once: true })
  const fallback = setTimeout(finish, 600)
}

export function useScrollListPicker(selectedListId, { isPaused = () => false, onScrollStart } = {}) {
  const sync = () => {
    if (isPaused()) return
    const id = listIdFromScrollPosition()
    if (id && id !== selectedListId.value) {
      selectedListId.value = id
    }
  }

  let ticking = false
  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      ticking = false
      onScrollStart?.()
      sync()
    })
  }

  onMounted(() => {
    sync()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  })

  return { sync }
}
