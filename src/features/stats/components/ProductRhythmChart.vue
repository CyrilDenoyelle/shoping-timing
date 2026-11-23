<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Tooltip,
  LineElement,
  PointElement,
  LinearScale,
  LogarithmicScale,
} from 'chart.js'
import { formatMs } from '@/utils/todo/todoIntervals.js'
import {
  buildRhythmChartModel,
  describeExclusion,
  summarizeExclusions,
} from '@/utils/stats/productRhythm.js'
import { formatPurchaseQtyLabel } from '@/utils/stats/purchaseTimeline.js'
import { fitLogRange } from '@/utils/stats/chartZoom.js'
import {
  countOutOfRhythm,
  describeForecast,
  forecastNextPurchase,
  formatEvery,
  formatShortDate,
} from '@/utils/stats/rhythmSummary.js'
import { useChartZoom } from '@/composables/useChartZoom.js'
import { DAY } from '@/utils/time.js'
import { rhythmGuidesPlugin } from '@/features/stats/chart/rhythmGuidesPlugin.js'

ChartJS.register(Tooltip, LineElement, PointElement, LinearScale, LogarithmicScale)

const props = defineProps({
  /** Produit issu de `buildProductRhythms`. */
  product: { type: Object, required: true },
  /** Couleurs issues de `readChartTheme`. */
  theme: { type: Object, required: true },
  /** Carte agrandie (plein écran de la liste) : la hauteur est donnée par le parent. */
  expanded: { type: Boolean, default: false },
  /** Mode avancé : détails du calcul et axe logarithmique. Sinon vue simple : rythme, prochain achat, axe linéaire. */
  advanced: { type: Boolean, default: true },
})

const emit = defineEmits(['toggle-expand'])

const plugins = [rhythmGuidesPlugin]

// À l'agrandissement, la carte vient se placer en haut de la zone visible (sous la barre d'outils collée).
// La réduction ne défile pas : lors d'un passage d'une carte à une autre, son défilement écraserait celui de
// la carte qui s'agrandit.
const root = ref(null)
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
watch(
  () => props.expanded,
  async (isExpanded) => {
    if (!isExpanded) return
    await nextTick()
    root.value?.scrollIntoView({
      block: 'start',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  },
)

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
// Graduations de l'axe : 2 chiffres significatifs gardent lisibles les petites valeurs (0,12) comme les grandes (1 200).
const tickNumberFormat = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 2 })
const fullDate = (ms) =>
  new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

const model = computed(() => buildRhythmChartModel(props.product))

// Zoom propre à cette carte : l'axe du temps se zoome et se déplace, l'axe vertical suit les points visibles.
const chartRef = ref(null)
const plotArea = () => {
  const chart = chartRef.value?.chart
  if (!chart?.chartArea) return null
  const { left, right } = chart.chartArea
  return { left: chart.canvas.getBoundingClientRect().left + left, width: right - left }
}
const {
  range: view,
  zoomed,
  canZoomIn,
  canZoomOut,
  zoomIn,
  zoomOut,
  reset: resetZoom,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
} = useChartZoom(() => model.value.xRange, plotArea)

const hasSelector = computed(() => props.product.scale !== 1 || props.product.unit !== '')

const summary = computed(() => {
  const { stats } = props.product
  const average = formatMs(stats.averageMs)
  const deviation = formatMs(stats.stdDevMs)
  return {
    average,
    deviation,
    counts: `${stats.usedCount} intervalle${stats.usedCount > 1 ? 's' : ''} utilisé${stats.usedCount > 1 ? 's' : ''} sur ${stats.totalCount}`,
    excluded: summarizeExclusions(props.product.exclusions),
  }
})

// Vue simple : le rythme en toutes lettres, le prochain achat estimé et le détail du calcul en petit.
const simple = computed(() => {
  const now = Date.now()
  const { product } = props
  const forecast = forecastNextPurchase(product, now)
  const outOfRhythm = countOutOfRhythm(product.exclusions)
  const details = [
    product.lastPurchaseAt == null ? null : `Dernier achat le ${formatShortDate(product.lastPurchaseAt, now)}`,
    summary.value.counts,
    outOfRhythm > 0 ? `${outOfRhythm} hors habitude` : null,
    summary.value.deviation ? `précision ± ${summary.value.deviation}` : null,
  ].filter(Boolean)
  return {
    every: formatEvery(product.stats.averageMs),
    forecast: forecast ? { status: forecast.status, ...describeForecast(forecast, now) } : null,
    details: details.join(' · '),
  }
})

const ariaLabel = computed(() => {
  const { text } = props.product
  const { average, counts } = summary.value
  return `Courbe des intervalles de ${text} : rythme retenu ${average ?? 'indéterminé'}, ${counts}.`
})

const chartData = computed(() => {
  const { points } = model.value
  const t = props.theme
  const bothUsed = (index) => points[index].used && points[index + 1]?.used
  return {
    datasets: [
      {
        label: 'Intervalles',
        data: points,
        showLine: true,
        tension: 0,
        borderWidth: 1.5,
        segment: {
          borderColor: (ctx) => (bothUsed(ctx.p0DataIndex) ? t.accent : t.muted),
          borderDash: (ctx) => (bothUsed(ctx.p0DataIndex) ? undefined : [3, 4]),
        },
        // Vue simple : points pleins pour le rythme, ronds creux gris pour les intervalles hors habitude.
        pointStyle: (ctx) => (ctx.raw.used || !props.advanced ? 'circle' : 'crossRot'),
        pointRadius: (ctx) => ctx.raw.radius,
        pointHoverRadius: (ctx) => ctx.raw.radius + 2,
        pointBackgroundColor: (ctx) => (ctx.raw.used ? t.accent : 'transparent'),
        // Aberrants (trop long / trop court) en rouge ; simples écartés par la règle des 2/3 en gris.
        pointBorderColor: (ctx) => {
          if (ctx.raw.used) return t.accent
          if (!props.advanced) return t.muted
          return ctx.raw.exclusion === 'trimmed' ? t.muted : t.danger
        },
        pointBorderWidth: (ctx) => (ctx.raw.used || !props.advanced ? 1.5 : 2),
        pointHitRadius: 12,
      },
    ],
  }
})

const chartOptions = computed(() => {
  const t = props.theme
  const { unit, band, meanY, points } = model.value
  const { min: xMin, max: xMax } = view.value
  const span = xMax - xMin
  // Le format des repères suit la durée affichée : mois et année, jour et mois, ou heure quand la vue est très serrée.
  const tickFormat =
    span > 330 * DAY
      ? { month: 'short', year: 'numeric' }
      : span < 4 * DAY
        ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
        : { day: 'numeric', month: 'short' }
  const formatTick = (ms) => new Date(ms).toLocaleDateString('fr-FR', tickFormat)
  const durationText = (value) => `${numberFormat.format(value)} ${unit.label}`
  const forSelector = hasSelector.value ? ` pour ${props.product.selectorLabel}` : ''

  // Axe logarithmique : un intervalle 3 fois trop long et un 3 fois trop court sont à égale distance de la médiane,
  // comme dans le calcul. Au-delà d'une décade, graduations en 1, 2 et 5 × 10ⁿ ; en dessous, les graduations
  // rondes (2 chiffres significatifs), ce qui écarte les bornes d'axe arbitraires comme 5,333.
  const logTick = (value, _index, ticks) => {
    const narrow = ticks.length > 1 && ticks[ticks.length - 1].value / ticks[0].value < 10
    if (narrow) {
      return Math.abs(value - Number(value.toPrecision(2))) < value * 1e-9 ? tickNumberFormat.format(value) : ''
    }
    const leading = value / 10 ** Math.floor(Math.log10(value))
    return [1, 2, 5].some((l) => Math.abs(leading - l) < 1e-6) ? tickNumberFormat.format(value) : ''
  }
  // Axe logarithmique dans les deux modes, ajusté aux points visibles : un intervalle très long ne compresse pas les autres.
  const fit = fitLogRange(points, view.value, [meanY])
  const axisTitle = props.advanced ? `Durée${forSelector}` : `Intervalle${forSelector}`
  const yAxis = {
    type: 'logarithmic',
    min: fit.min,
    max: fit.max,
    title: {
      display: true,
      text: `${axisTitle} (${unit.label})`,
      color: t.muted,
      font: { size: 10, weight: '500' },
    },
    grid: { color: t.border },
    ticks: { color: t.muted, maxTicksLimit: 5, font: { size: 10 }, callback: logTick },
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    // Les mises à jour du zoom suivent le doigt ou le curseur sans transition.
    animation: false,
    interaction: { mode: 'nearest', intersect: false },
    layout: { padding: { left: 0, right: 8, top: 6, bottom: 0 } },
    plugins: {
      legend: { display: false },
      rhythmGuides: {
        band,
        bandColor: t.accentSoft,
        mean: meanY,
        meanColor: t.accent,
      },
      tooltip: {
        displayColors: false,
        callbacks: {
          title: (items) => `Achat du ${fullDate(items[0].raw.x)}`,
          label: (ctx) => {
            const p = ctx.raw
            if (!props.advanced) {
              return [`Intervalle${forSelector} : ${durationText(p.y)}`, ...(p.used ? [] : ['Hors habitude'])]
            }
            return [
              `Durée${forSelector} : ${durationText(p.y)}`,
              `Intervalle réel : ${durationText(p.intervalMs / unit.ms)} · quantité achetée ${formatPurchaseQtyLabel(p.qty, props.product.unit)}`,
              p.used ? 'Utilisé dans le calcul' : `Écarté : ${describeExclusion(p.exclusion)}`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        min: xMin,
        max: xMax,
        grid: { display: false },
        ticks: {
          color: t.muted,
          maxTicksLimit: 4,
          maxRotation: 0,
          font: { size: 10 },
          callback: (value) => formatTick(value),
        },
      },
      y: yAxis,
    },
  }
})
</script>

<template>
  <article ref="root" class="rhythm-card" :class="{ expanded }">
    <header class="card-head">
      <div class="card-top">
        <h4 class="card-title">
          <span class="card-name">{{ product.text }}</span>
          <span v-if="hasSelector" class="card-badge">{{ product.selectorLabel }}</span>
        </h4>
        <!-- aria-disabled garde le focus clavier sur le bouton quand son action devient indisponible -->
        <div class="zoom-controls" role="group" :aria-label="`Zoom de la courbe ${product.text}`">
          <button
            type="button"
            class="zoom-btn"
            :aria-disabled="canZoomOut ? null : 'true'"
            title="Zoom arrière"
            aria-label="Zoom arrière"
            @click="zoomOut"
          >
            −
          </button>
          <button
            type="button"
            class="zoom-btn"
            :aria-disabled="canZoomIn ? null : 'true'"
            title="Zoom avant (ou Ctrl + molette, ou pincer)"
            aria-label="Zoom avant"
            @click="zoomIn"
          >
            +
          </button>
          <button
            type="button"
            class="zoom-btn"
            :aria-disabled="zoomed ? null : 'true'"
            title="Revenir à la vue complète"
            aria-label="Réinitialiser le zoom"
            @click="resetZoom"
          >
            ↺
          </button>
          <button
            type="button"
            class="zoom-btn"
            :title="expanded ? 'Réduire la courbe (ou double-clic, ou Échap)' : 'Agrandir la courbe (ou double-clic)'"
            :aria-label="expanded ? 'Réduire la courbe' : 'Agrandir la courbe'"
            @click="emit('toggle-expand')"
          >
            <svg class="expand-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path v-if="expanded" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              <path v-else d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        </div>
      </div>
      <template v-if="advanced">
        <p class="card-summary">
          <template v-if="summary.average">
            Rachat en moyenne tous les <strong>{{ summary.average }}</strong>
            <span v-if="summary.deviation" class="card-deviation"> ± {{ summary.deviation }}</span>
          </template>
          <template v-else>Rythme indéterminé</template>
        </p>
        <p class="card-counts">
          {{ summary.counts }}
          <span v-if="summary.excluded" class="card-excluded">· écartés : {{ summary.excluded }}</span>
        </p>
      </template>
      <template v-else>
        <p class="card-summary">
          <template v-if="simple.every">
            Rythme : <strong>{{ simple.every }}</strong> environ
          </template>
          <template v-else>Rythme indéterminé</template>
        </p>
        <p v-if="simple.forecast" class="card-forecast">
          <span class="status-pill" :class="`status-${simple.forecast.status}`">
            <span class="status-dot" aria-hidden="true"></span>{{ simple.forecast.badge }}
          </span>
          <span class="forecast-text">{{ simple.forecast.text }}</span>
        </p>
        <p class="card-counts">{{ simple.details }}</p>
      </template>
    </header>
    <div
      class="chart-box"
      :class="{ zoomed }"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="emit('toggle-expand')"
    >
      <Line ref="chartRef" :data="chartData" :options="chartOptions" :plugins="plugins" :aria-label="ariaLabel" />
    </div>
  </article>
</template>

<style scoped>
.rhythm-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.65rem 0.75rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-background);
  min-width: 0;
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-title {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  min-width: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-heading);
  line-height: 1.3;
}

.zoom-controls {
  display: flex;
  flex-shrink: 0;
  gap: 0.25rem;
}

.zoom-btn {
  width: 2.25rem;
  height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 1.05rem;
  line-height: 1;
  color: var(--color-text-muted);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}

.zoom-btn:hover {
  color: var(--color-text);
  border-color: var(--color-border-hover);
}

.zoom-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.zoom-btn[aria-disabled='true'] {
  opacity: 0.4;
  cursor: default;
}

.zoom-btn[aria-disabled='true']:hover {
  color: var(--color-text-muted);
  border-color: var(--color-border);
}

.expand-icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Carte agrandie : le graphique prend toute la hauteur que le parent lui donne, et le défilement
   automatique la cale sous la barre d'outils collée (--toolbar-height, définie par le parent). */
.rhythm-card.expanded {
  border-color: var(--accent);
  scroll-margin-top: var(--toolbar-height, 0px);
}

.rhythm-card.expanded .chart-box {
  flex: 1 1 auto;
  height: auto;
  min-height: 240px;
}

.card-name {
  min-width: 0;
  word-break: break-word;
}

.card-badge {
  flex-shrink: 0;
  padding: 0.06rem 0.4rem;
  font-size: 0.65rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 999px;
  white-space: nowrap;
}

.card-summary {
  font-size: 0.8rem;
  color: var(--color-text);
  line-height: 1.35;
}

.card-summary strong {
  font-weight: 600;
  color: var(--accent);
}

.card-deviation {
  color: var(--color-text-muted);
}

.card-counts {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  line-height: 1.35;
}

.card-excluded {
  color: var(--color-text);
}

.card-forecast {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem 0.5rem;
  font-size: 0.8rem;
  line-height: 1.35;
}

.forecast-text {
  color: var(--color-text);
}

/* Pastille d'état : la couleur s'appuie sur le point ; le texte garde la couleur courante pour rester lisible. */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.1rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  white-space: nowrap;
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--color-text-muted);
}

.status-soon {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.status-soon .status-dot,
.status-listed .status-dot {
  background: var(--accent);
}

.status-listed {
  border-color: var(--accent);
}

.status-late {
  border-color: var(--danger);
}

.status-late .status-dot {
  background: var(--danger);
}

.chart-box {
  position: relative;
  height: 180px;
  width: 100%;
  /* Un glissé vertical au doigt défile la page ; le glissé horizontal déplace la courbe. */
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}

.chart-box.zoomed {
  cursor: grab;
}

.chart-box.zoomed:active {
  cursor: grabbing;
}

.chart-box :deep(canvas) {
  display: block;
  -webkit-tap-highlight-color: transparent;
  touch-action: pan-y;
}
</style>
