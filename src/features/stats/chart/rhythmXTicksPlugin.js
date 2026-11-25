/**
 * Petits traits sous l'aire du graphique, alignés sur les graduations X (dates d'achats).
 * En mode `guides`, un pointillé fin relie chaque graduation au point correspondant.
 *
 * Options (`options.plugins.rhythmXTicks`) : `color`, `guides` (bool), `guideColor`.
 */
export const rhythmXTicksPlugin = {
  id: 'rhythmXTicks',
  afterDatasetsDraw(chart, _args, options) {
    const x = chart.scales.x
    const y = chart.scales.y
    const { ctx, chartArea } = chart
    if (!x || !chartArea || !options?.color) return

    const points = chart.data?.datasets?.[0]?.data ?? []
    const pointByX = new Map(points.map((p) => [p.x, p]))

    const yTick0 = chartArea.bottom - 1
    const yTick1 = Math.min(chartArea.bottom + 7, chart.height - 1)

    ctx.save()
    for (const tick of x.ticks) {
      const px = Math.round(x.getPixelForValue(tick.value)) + 0.5
      if (px < chartArea.left || px > chartArea.right) continue

      if (options.guides && y) {
        const point = pointByX.get(tick.value)
        if (point && Number.isFinite(point.y)) {
          const py = y.getPixelForValue(point.y)
          if (py >= chartArea.top && py <= chartArea.bottom) {
            ctx.strokeStyle = options.guideColor || options.color
            ctx.lineWidth = 1.35
            ctx.setLineDash([2, 3])
            ctx.beginPath()
            ctx.moveTo(px, py)
            ctx.lineTo(px, chartArea.bottom)
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
      }

      ctx.strokeStyle = options.color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, yTick0)
      ctx.lineTo(px, yTick1)
      ctx.stroke()
    }
    ctx.restore()
  },
}
