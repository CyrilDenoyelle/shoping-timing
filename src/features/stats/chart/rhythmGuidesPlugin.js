const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * Plugin Chart.js : dessine derrière les points la plage tolérée (bande) et le rythme retenu (ligne pointillée).
 * Ces repères sont tracés au canvas plutôt que comme jeux de données, ce qui garde le survol
 * et l'infobulle limités aux intervalles.
 *
 * Options (`options.plugins.rhythmGuides`) :
 * `band` ({ lower, upper } en unités de l'axe Y, ou null), `bandColor`, `mean` (valeur ou null), `meanColor`.
 */
export const rhythmGuidesPlugin = {
  id: 'rhythmGuides',
  beforeDatasetsDraw(chart, _args, options) {
    const { ctx, chartArea, scales } = chart
    const y = scales.y
    if (!options || !chartArea || !y) return
    const { left, right, top, bottom } = chartArea

    ctx.save()
    if (options.band) {
      const yTop = clamp(y.getPixelForValue(options.band.upper), top, bottom)
      const yBottom = clamp(y.getPixelForValue(options.band.lower), top, bottom)
      ctx.fillStyle = options.bandColor
      ctx.fillRect(left, yTop, right - left, yBottom - yTop)
    }
    if (options.mean != null) {
      const yMean = y.getPixelForValue(options.mean)
      if (yMean >= top && yMean <= bottom) {
        ctx.strokeStyle = options.meanColor
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(left, yMean)
        ctx.lineTo(right, yMean)
        ctx.stroke()
      }
    }
    ctx.restore()
  },
}
