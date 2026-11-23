import { computed, ref, toValue, watch } from 'vue'
import { ZOOM_STEP, isZoomed, minSpanFor, panRange, zoomRange } from '@/utils/stats/chartZoom.js'

// Une molette de souris (deltaY ≈ 100) multiplie la durée affichée par ≈ 1,3 ; le pincement d'un pavé tactile
// envoie de petits deltaY à haute fréquence et reste fluide avec la même sensibilité.
const WHEEL_SENSITIVITY = 0.0025
const MAX_WHEEL_DELTA = 100
const LINE_HEIGHT_PX = 16

const clamp01 = (value) => Math.min(1, Math.max(0, value))

/**
 * Zoom et déplacement horizontaux d'une courbe, indépendants d'une courbe à l'autre.
 *
 * Gestes : Ctrl/Cmd + molette (ou pincement d'un pavé tactile) zoome autour du curseur ; deux doigts pincent
 * et déplacent ; un glissé horizontal (souris ou un doigt) déplace la vue. La molette seule garde le défilement
 * de la page, et un glissé vertical au doigt reste un défilement (`touch-action: pan-y` sur le canvas).
 *
 * @param {import('vue').MaybeRefOrGetter<{ min: number, max: number }>} fullRange plage complète de la courbe
 * @param {() => ({ left: number, width: number } | null)} plotArea zone de tracé en pixels écran (null si indisponible)
 */
export function useChartZoom(fullRange, plotArea) {
  const full = () => toValue(fullRange)
  const view = ref(null)

  const range = computed(() => view.value ?? full())
  const zoomed = computed(() => isZoomed(range.value, full()))
  const canZoomOut = zoomed
  const canZoomIn = computed(() => range.value.max - range.value.min - minSpanFor(full()) > 1)

  // Les données ont changé (nouvel achat) : la vue complète est la seule référence fiable.
  watch(
    () => [full().min, full().max],
    () => {
      view.value = null
    },
  )

  function setRange(next) {
    view.value = isZoomed(next, full()) ? next : null
  }

  function zoomBy(factor, anchor) {
    setRange(zoomRange(range.value, full(), factor, anchor))
  }

  const zoomIn = () => zoomBy(ZOOM_STEP)
  const zoomOut = () => zoomBy(1 / ZOOM_STEP)
  const reset = () => {
    view.value = null
  }

  /** Instant situé sous une abscisse écran, borné à la zone de tracé. */
  function valueAt(clientX) {
    const area = plotArea()
    if (!area || area.width <= 0) return null
    const { min, max } = range.value
    return min + clamp01((clientX - area.left) / area.width) * (max - min)
  }

  function onWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return
    // Empêche aussi le zoom de la page par le navigateur
    event.preventDefault()
    const anchor = valueAt(event.clientX)
    const lines = event.deltaMode === 1 ? LINE_HEIGHT_PX : 1
    const delta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, event.deltaY * lines))
    zoomBy(Math.exp(-delta * WHEEL_SENSITIVITY), anchor ?? undefined)
  }

  // Pointeurs actifs (souris ou doigts) : identifiant → abscisse écran
  const pointers = new Map()
  let lastPinchDistance = null

  const pinchState = () => {
    const [a, b] = [...pointers.values()]
    return { distance: Math.abs(a - b), center: (a + b) / 2 }
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointers.set(event.pointerId, event.clientX)
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId)
    } catch {
      // Pointeur déjà relâché : le geste reste suivi par les événements suivants
    }
    lastPinchDistance = pointers.size === 2 ? pinchState().distance : null
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return
    const previousX = pointers.get(event.pointerId)
    const previousCenter = pointers.size === 2 ? pinchState().center : null
    pointers.set(event.pointerId, event.clientX)
    const area = plotArea()
    if (!area || area.width <= 0) return

    if (pointers.size === 1) {
      const span = range.value.max - range.value.min
      setRange(panRange(range.value, full(), (-(event.clientX - previousX) * span) / area.width))
    } else if (pointers.size === 2) {
      const { distance, center } = pinchState()
      if (lastPinchDistance && distance > 0) {
        // L'instant qui était sous le milieu des doigts reste sous le milieu des doigts
        const anchor = valueAt(previousCenter)
        zoomBy(distance / lastPinchDistance, anchor ?? undefined)
        if (anchor != null) {
          const drift = anchor - valueAt(center)
          setRange(panRange(range.value, full(), drift))
        }
      }
      lastPinchDistance = distance
    }
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId)
    lastPinchDistance = pointers.size === 2 ? pinchState().distance : null
  }

  return {
    range,
    zoomed,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    reset,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
