/**
 * Calculs de zoom et de déplacement d'une image affichée au centre d'une zone.
 * Les coordonnées sont relatives au centre de la zone ; la transformation appliquée à l'image est
 * translate(tx, ty) scale(scale) autour de son centre.
 */

export const MIN_SCALE = 1
export const MAX_SCALE = 8

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value)) + 0 // « + 0 » convertit -0 en 0
}

/** Limite le déplacement pour que l'image reste couvrir la zone (ou reste centrée si elle est plus petite). */
export function clampPan({ tx, ty, scale, imageWidth, imageHeight, stageWidth, stageHeight }) {
  const maxX = Math.max(0, (imageWidth * scale - stageWidth) / 2)
  const maxY = Math.max(0, (imageHeight * scale - stageHeight) / 2)
  return { tx: clamp(tx, -maxX, maxX), ty: clamp(ty, -maxY, maxY) }
}

/** Nouveau zoom en gardant fixe le point (px, py) de la zone. */
export function zoomAt(view, nextScale, px, py, bounds) {
  const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE)
  const ratio = scale / view.scale
  const tx = px - (px - view.tx) * ratio
  const ty = py - (py - view.ty) * ratio
  return { scale, ...clampPan({ tx, ty, scale, ...bounds }) }
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
