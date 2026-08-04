/**
 * Sélection de liste liée au scroll — mapping bidirectionnel unique.
 *
 * Scroll → liste :
 *   t = scrollY / maxScroll              (0 en haut, 1 en bas)
 *   offsetViewport = readingTop + t × readingHeight
 *     (readingTop = bas de la barre sticky, readingHeight = zone visible restante)
 *   focusY = scrollY + offsetViewport
 *   t_page = scrollY / maxScroll            (0 en haut, 1 en bas)
 *   liste = section qui contient focusY (prioritaire, évite l'overshoot)
 *   dans un gap : ancre = top + t_page × height, la plus proche
 *
 * Liste → scroll (dropdown) :
 *   t_list = position de la liste dans la pile (0 → 1)
 *   focusY cible = listTop + t_list × listHeight
 *   scrollY = (focusY − readingTop) / (1 + readingHeight / maxScroll) (clampé)
 */
import { onMounted, onBeforeUnmount } from 'vue'

const SCROLL_ANCHOR_SELECTOR = '[data-scroll-list-picker-anchor]'
const HIGHLIGHT_ATTR = 'data-quick-add-target'

let layoutCache = null
let resizeObserver = null
let highlightedListId = null
let highlightedEl = null

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

function observeSections(sections) {
  resizeObserver?.disconnect()
  if (!sections.length || typeof ResizeObserver === 'undefined') return

  resizeObserver = new ResizeObserver(() => {
    invalidateLayout()
  })
  for (const section of sections) {
    resizeObserver.observe(section)
  }
  const anchor = document.querySelector(SCROLL_ANCHOR_SELECTOR)
  if (anchor) resizeObserver.observe(anchor)
}

/** Invalide le cache de positions document (listes, hauteurs). */
export function invalidateLayout() {
  layoutCache = null
}

function buildLayoutCache(sections, scrollY, viewportH) {
  const bounds = sections.map((section) => {
    const rect = section.getBoundingClientRect()
    const top = rect.top + scrollY
    return { id: section.dataset.listId, top, span: rect.height, el: section }
  })

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportH)
  const readingTop = measureReadingTop()
  const readingHeight = Math.max(0, viewportH - readingTop)

  layoutCache = {
    bounds,
    viewportH,
    maxScroll,
    readingTop,
    readingHeight,
  }
  observeSections(sections)
  return layoutCache
}

/**
 * Mesure la pile de listes.
 * En cache hit, seul scrollY est relu — pas de getBoundingClientRect / scrollHeight.
 */
export function measureListLayout({ force = false } = {}) {
  const scrollY = window.scrollY

  if (!force && layoutCache?.bounds?.length) {
    return layoutCache
  }

  const viewportH = window.innerHeight
  const sections = getSections()
  if (!sections.length) {
    layoutCache = null
    return null
  }

  return buildLayoutCache(sections, scrollY, viewportH)
}

/** Point visé dans une section : t=0 → haut, t=1 → bas. */
export function anchorYInSection(bound, t) {
  return bound.top + t * bound.span
}

/**
 * Position t de la liste dans la pile (0 = tout en haut, 1 = tout en bas).
 * Basé sur le centre vertical de la section dans l'étendue document.
 */
export function listPositionT(bound, layout) {
  const { bounds } = layout
  const rangeTop = bounds[0].top
  const last = bounds[bounds.length - 1]
  const range = last.top + last.span - rangeTop
  if (range <= 0) return 0.5
  const center = bound.top + bound.span / 2
  return Math.min(1, Math.max(0, (center - rangeTop) / range))
}

/** focusY cible pour amener l'ancre de la liste sous la ligne de lecture. */
export function focusYTargetForList(bound, layout) {
  return anchorYInSection(bound, listPositionT(bound, layout))
}

/** Ligne de lecture dans le document, sous la barre sticky. */
export function focusYFromScroll(scrollY, layout) {
  const { maxScroll, viewportH, readingTop, readingHeight } = layout
  const t = scrollT(scrollY, maxScroll)
  if (readingHeight <= 0) return scrollY + t * viewportH
  return scrollY + readingTop + t * readingHeight
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

/**
 * Liste sous focusY.
 * Hit-test géométrique d'abord (évite l'overshoot quand t_page est bas/haut
 * et que toutes les ancres se retrouvent en haut/bas des sections).
 * Ancres interpolées (top→bas selon t) uniquement dans les gaps.
 */
export function listIdAtFocusY(focusY, bounds, t) {
  for (const b of bounds) {
    if (focusY >= b.top && focusY < b.top + b.span) {
      return b.id
    }
  }

  if (focusY < bounds[0].top) return bounds[0].id
  const last = bounds[bounds.length - 1]
  if (focusY >= last.top + last.span) return last.id

  let best = bounds[0]
  let bestDist = Infinity
  for (const b of bounds) {
    const dist = Math.abs(focusY - anchorYInSection(b, t))
    if (dist < bestDist) {
      bestDist = dist
      best = b
    }
  }
  return best.id
}

export function listIdFromScrollPosition(scrollY = window.scrollY) {
  const layout = measureListLayout()
  if (!layout) return null
  if (layout.bounds.length === 1) return layout.bounds[0].id

  const tPage = scrollT(scrollY, layout.maxScroll)
  const focusY = focusYFromScroll(scrollY, layout)
  return listIdAtFocusY(focusY, layout.bounds, tPage)
}

export function scrollYForList(listId) {
  const layout = measureListLayout({ force: true })
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

function findSectionEl(id) {
  const cached = layoutCache?.bounds?.find((b) => b.id === id)?.el
  if (cached?.isConnected) return cached
  return document.querySelector(`[data-list-id="${id}"]`)
}

function updateSectionHighlight(id) {
  if (highlightedListId === id) return
  if (highlightedEl?.isConnected) {
    highlightedEl.removeAttribute(HIGHLIGHT_ATTR)
  } else if (highlightedListId) {
    document
      .querySelector(`[data-list-id="${highlightedListId}"]`)
      ?.removeAttribute(HIGHLIGHT_ATTR)
  }
  highlightedListId = id
  highlightedEl = id ? findSectionEl(id) : null
  highlightedEl?.setAttribute(HIGHLIGHT_ATTR, '')
}

function clearSectionHighlight() {
  if (!highlightedListId) return
  if (highlightedEl?.isConnected) {
    highlightedEl.removeAttribute(HIGHLIGHT_ATTR)
  } else {
    document
      .querySelector(`[data-list-id="${highlightedListId}"]`)
      ?.removeAttribute(HIGHLIGHT_ATTR)
  }
  highlightedListId = null
  highlightedEl = null
}

export function useScrollListPicker(selectedListId, { isPaused = () => false, onScrollStart } = {}) {
  let pendingId = null
  let commitTimer = null

  const commitSelectedId = (id) => {
    if (id && id !== selectedListId.value) {
      selectedListId.value = id
    }
  }

  const sync = ({ forceLayout = false, immediate = false } = {}) => {
    if (forceLayout) invalidateLayout()
    if (!isPaused()) {
      const id = listIdFromScrollPosition()
      if (id) {
        updateSectionHighlight(id)
        if (immediate) {
          clearTimeout(commitTimer)
          commitTimer = null
          pendingId = null
          commitSelectedId(id)
        } else if (id !== selectedListId.value && id !== pendingId) {
          pendingId = id
          clearTimeout(commitTimer)
          // Diffère le commit Vue : le highlight DOM reste immédiat, le label sticky
          // ne se met à jour qu'après une courte pause (évite re-renders en rafale).
          commitTimer = setTimeout(() => {
            commitTimer = null
            const next = pendingId
            pendingId = null
            commitSelectedId(next)
          }, 80)
        }
      }
    } else {
      clearTimeout(commitTimer)
      commitTimer = null
      pendingId = null
      updateSectionHighlight(selectedListId.value)
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

  const onResize = () => {
    invalidateLayout()
    onScroll()
  }

  onMounted(() => {
    sync({ forceLayout: true, immediate: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    clearTimeout(commitTimer)
    resizeObserver?.disconnect()
    resizeObserver = null
    clearSectionHighlight()
  })

  return {
    sync: (opts) => sync({ ...opts, immediate: true }),
    invalidateLayout,
    updateHighlight: () => updateSectionHighlight(selectedListId.value),
  }
}
