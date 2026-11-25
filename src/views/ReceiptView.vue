<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useHistoryLayer } from '@/composables/useHistoryLayer.js'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import { recognizePasses } from '@/services/ocr/tesseractService.js'
import { ensureTesseractAssetsCached } from '@/services/ocr/tesseractAssets.js'
import {
  loadReceiptPhoto,
  renderCleanVariant,
  CLEAN_VARIANTS,
} from '@/utils/receipt/imagePreprocess.js'
import { analyzePasses } from '@/utils/receipt/analyzeReceipt.js'
import {
  buildReviewLines,
  canValidate,
  mergeReviewCandidates,
  reviewIssues,
  validateReviewLines,
} from '@/utils/receipt/reviewLines.js'
import { saveReceipt } from '@/services/receipt/receiptsRepository.js'
import { useTodoStorage } from '@/composables/useTodoStorage.js'
import ReceiptLineRow from '@/features/receipt/components/ReceiptLineRow.vue'
import ReceiptSummary from '@/features/receipt/components/ReceiptSummary.vue'
import ImageViewer from '@/features/receipt/components/ImageViewer.vue'

// Chaque photo est lue trois fois (deux réglages de binarisation après recadrage, puis la photo d'origine).
// Les trois lectures sont analysées ensemble et la plus cohérente est retenue.
// Les lignes lues sont ensuite rapprochées des produits existants, relues par l'utilisateur, puis validées.

const todoStorage = useTodoStorage()

const PASS_DEFS = [
  ...CLEAN_VARIANTS.map((variant) => ({ id: variant.id, label: variant.label, variant })),
  { id: 'original', label: 'Photo d’origine', variant: null },
]

const router = useRouter()

const photos = ref([]) // { id, file, previewUrl }
const results = ref([]) // { key, passId, id, text, durationMs, processedUrl, label }
const running = ref(false)
const error = ref('')
const progress = ref({ index: 0, ratio: 0, total: 0 })
const passes = ref([]) // { id, label, text, products, summary }
const best = ref(null)
const bestReason = ref('')
const lines = ref([]) // lignes de revue (voir reviewLines.js)
const report = ref(null)
const declaredTotalCents = ref(null) // total du ticket, corrigible à la main
const viewer = ref(null) // { src, alt } de l'image affichée en grand
const leaveModalOpen = ref(false)
const issuesModalOpen = ref(false)
const issuesMessages = ref([])

// Le bouton « retour » ferme d'abord la photo affichée en grand.
const viewerLayer = useHistoryLayer(() => {
  viewer.value = null
})

function openViewer(src, alt) {
  viewer.value = { src, alt }
  viewerLayer.push()
}

// Une lecture en cours (photos ou lignes) reste à valider tant que le rapport n'existe pas.
const hasUnsavedWork = computed(() => !report.value && (photos.value.length > 0 || lines.value.length > 0))

let resolveLeave = null

onBeforeRouteLeave(() => {
  if (!hasUnsavedWork.value) return true
  leaveModalOpen.value = true
  return new Promise((resolve) => {
    resolveLeave = resolve
  })
})

function answerLeave(confirmed) {
  leaveModalOpen.value = false
  resolveLeave?.(confirmed)
  resolveLeave = null
}

function onBeforeUnload(event) {
  if (!hasUnsavedWork.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  // Remplit le cache OCR dès l’ouverture de la page (le SW doit contrôler la page).
  ensureTesseractAssetsCached().catch((error) => console.warn('[tesseract] préchargement', error))
})

const existingCandidates = computed(() =>
  todoStorage.allTodoTexts.value.map((entry) => ({
    id: entry.todoId,
    listId: entry.listId,
    listName: entry.listName,
    text: entry.text,
    receiptNames: entry.receiptNames,
    done: entry.done,
  })),
)
const lists = computed(() => todoStorage.lists.value.map((l) => ({ id: l.id, name: l.name })))
const defaultListId = computed(() => lists.value[0]?.id ?? null)
/** Produits de l’app + brouillons « nouveau » déjà saisis sur ce ticket (autocomplétion entre lignes). */
const candidates = computed(() => mergeReviewCandidates(existingCandidates.value, lines.value, lists.value))
const ready = computed(() => canValidate(lines.value))

let nextId = 1
const processedUrls = new Map() // `${passId}-${photoId}` -> url

const progressValue = computed(() => progress.value.index + progress.value.ratio)

function formatEuro(cents) {
  if (cents == null) return '—'
  const sign = cents < 0 ? '-' : ''
  return `${sign}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')} €`
}

function onFilesSelected(event) {
  const files = Array.from(event.target.files ?? [])
  for (const file of files) {
    photos.value.push({ id: nextId++, file, previewUrl: URL.createObjectURL(file) })
  }
  event.target.value = ''
}

function removePhoto(id) {
  const photo = photos.value.find((p) => p.id === id)
  if (photo) URL.revokeObjectURL(photo.previewUrl)
  photos.value = photos.value.filter((p) => p.id !== id)
}

function clearResults() {
  for (const url of processedUrls.values()) URL.revokeObjectURL(url)
  processedUrls.clear()
  results.value = []
  passes.value = []
  best.value = null
  bestReason.value = ''
  lines.value = []
  report.value = null
  declaredTotalCents.value = null
  issuesModalOpen.value = false
  issuesMessages.value = []
}

function canvasToUrl(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png')
  })
}

/** Une image par photo et par passe : variantes binarisées, ou photo d'origine remise à l'endroit. */
async function buildPasses() {
  const loaded = []
  for (const photo of photos.value) loaded.push({ id: photo.id, data: await loadReceiptPhoto(photo.file) })

  const built = []
  for (const def of PASS_DEFS) {
    const items = []
    for (const { id, data } of loaded) {
      if (def.variant) {
        const canvas = renderCleanVariant(data, def.variant)
        const url = await canvasToUrl(canvas)
        if (url) processedUrls.set(`${def.id}-${id}`, url)
        items.push({ id, source: canvas })
      } else {
        items.push({ id, source: data.original })
      }
    }
    built.push({ id: def.id, label: def.label, layout: 'block', items })
  }
  return built
}

async function runOcr() {
  if (running.value || photos.value.length === 0) return
  running.value = true
  error.value = ''
  clearResults()

  try {
    const passInputs = await buildPasses()
    const total = passInputs.length * photos.value.length
    progress.value = { index: 0, ratio: 0, total }

    const labels = Object.fromEntries(PASS_DEFS.map((def) => [def.id, def.label]))
    const resultsByPass = await recognizePasses(passInputs, {
      onProgress: ({ passIndex, itemIndex, ratio }) => {
        progress.value = { index: passIndex * photos.value.length + itemIndex, ratio, total }
      },
      onResult: (result) => {
        results.value.push({
          ...result,
          key: `${result.passId}-${result.id}`,
          processedUrl: processedUrls.get(`${result.passId}-${result.id}`) ?? null,
          label: labels[result.passId],
        })
      },
    })

    const analysis = analyzePasses(
      PASS_DEFS.map((def) => ({
        id: def.id,
        label: def.label,
        texts: (resultsByPass[def.id] ?? []).map((r) => r.text),
      })),
    )
    passes.value = analysis.passes
    best.value = analysis.best
    bestReason.value = analysis.reason
    lines.value = analysis.best
      ? buildReviewLines(analysis.best.products, existingCandidates.value, {
          defaultListId: defaultListId.value,
          lists: lists.value,
        })
      : []
    declaredTotalCents.value = analysis.best?.summary.declaredTotalCents ?? null
  } catch (e) {
    console.error(e)
    error.value = `Échec de la lecture : ${e?.message || e?.name || String(e)}`
  } finally {
    running.value = false
  }
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

function validate() {
  if (!ready.value || report.value) return
  const issues = reviewIssues(lines.value, declaredTotalCents.value)
  if (issues.hasIssues) {
    issuesMessages.value = issues.messages
    issuesModalOpen.value = true
    return
  }
  const result = validateReviewLines(lines.value, todoStorage)
  saveReceipt({
    totalCents: result.totalCents,
    declaredTotalCents: declaredTotalCents.value,
    entries: result.entries,
  })
  report.value = result
}

function goHome() {
  router.push({ name: 'home' })
}

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  for (const photo of photos.value) URL.revokeObjectURL(photo.previewUrl)
  clearResults()
})
</script>

<template>
  <div class="receipt-page">
    <span class="app-label">ShopingTiming</span>
    <header class="receipt-top">
      <button type="button" class="back-btn" aria-label="Retour aux listes" @click="goHome">
        ← Listes
      </button>
      <h1 class="receipt-title">Lecture de ticket</h1>
    </header>

    <section class="block">
      <div class="pickers">
        <label class="pick-btn">
          Prendre une photo
          <input type="file" accept="image/*" capture="environment" hidden @change="onFilesSelected" />
        </label>
        <label class="pick-btn">
          Choisir des photos
          <input type="file" accept="image/*" multiple hidden @change="onFilesSelected" />
        </label>
      </div>

      <ul v-if="photos.length" class="thumbs">
        <li v-for="photo in photos" :key="photo.id" class="thumb">
          <button
            type="button"
            class="thumb-open"
            :aria-label="`Voir la photo ${photo.id} en grand`"
            @click="openViewer(photo.previewUrl, `Photo ${photo.id}`)"
          >
            <img :src="photo.previewUrl" :alt="`Photo ${photo.id}`" />
          </button>
          <button
            type="button"
            class="thumb-remove"
            aria-label="Retirer cette photo"
            @click="removePhoto(photo.id)"
          >
            ✕
          </button>
        </li>
      </ul>

      <button
        type="button"
        class="run-btn"
        :disabled="running || photos.length === 0"
        @click="runOcr"
      >
        {{ running ? 'Lecture en cours…' : 'Lire le ticket' }}
      </button>

      <progress
        v-if="running"
        class="progress"
        :value="progressValue"
        :max="progress.total"
      />
      <p v-if="running" class="status">
        Lecture {{ progress.index + 1 }} / {{ progress.total }}
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>

    <section v-if="best" class="block structured">
      <h2 class="section-title">Lecture structurée</h2>
      <p class="reason">
        <strong>{{ best.label }}</strong> retenue : {{ bestReason }}
      </p>

      <div class="receipt-grid receipt-head" aria-hidden="true">
        <span />
        <span>Ticket</span>
        <span>Produit</span>
        <span class="num">Qté</span>
        <span class="num">Unité €</span>
        <span class="num">Total €</span>
        <span>Catégorie</span>
      </div>

      <ul class="review">
        <ReceiptLineRow
          v-for="line in lines"
          :key="line.key"
          :line="line"
          :candidates="candidates"
          :lists="lists"
          :default-list-id="defaultListId"
        />
      </ul>

      <ReceiptSummary
        :lines="lines"
        :declared-total-cents="declaredTotalCents"
        :can-validate="ready"
        :report="report"
        @validate="validate"
        @done="goHome"
        @update:declared-total-cents="declaredTotalCents = $event"
      />

      <details class="diagnostics">
        <summary>Détail des lectures</summary>
        <dl class="totals">
          <dt>Lignes lues / déclarées</dt>
          <dd>{{ best.summary.productCount }} / {{ best.summary.declaredLineCount ?? '—' }}</dd>
          <dt>Articles lus / déclarés</dt>
          <dd>{{ best.summary.articleCount }} / {{ best.summary.declaredCount ?? '—' }}</dd>
        </dl>
        <ul class="passes">
          <li v-for="pass in passes" :key="pass.id">
            {{ pass.label }} : {{ pass.summary.productCount }} lignes,
            somme {{ formatEuro(pass.summary.sumCents) }},
            écart {{ formatEuro(pass.summary.differenceCents) }},
            {{ pass.summary.flaggedCount }} à vérifier
          </li>
        </ul>
      </details>
    </section>

    <details v-if="results.length" class="block diagnostics">
      <summary class="section-title">Lectures brutes</summary>
      <article v-for="result in results" :key="result.key" class="result">
        <header class="result-head">
          <h3>Photo {{ result.id }} <span class="mode-label">{{ result.label }}</span></h3>
          <span class="duration">{{ formatDuration(result.durationMs) }}</span>
        </header>
        <img
          v-if="result.processedUrl"
          :src="result.processedUrl"
          class="processed"
          alt="Image après prétraitement"
          @click="openViewer(result.processedUrl, `Photo ${result.id} – ${result.label}`)"
        />
        <pre class="raw-text">{{ result.text || '(aucun texte détecté)' }}</pre>
      </article>
    </details>
    <ImageViewer v-if="viewer" :src="viewer.src" :alt="viewer.alt" @close="viewerLayer.dismiss" />

    <ConfirmModal
      v-if="leaveModalOpen"
      title="Quitter la lecture du ticket ?"
      message="Les achats de ce ticket restent à valider. Quitter maintenant efface la lecture en cours."
      confirm-label="Quitter"
      cancel-label="Rester"
      @confirm="answerLeave(true)"
      @cancel="answerLeave(false)"
    />

    <ConfirmModal
      v-if="issuesModalOpen"
      title="Corriger les lignes en rouge"
      message="Les montants ou les produits en rouge doivent être cohérents avant de valider les achats."
      confirm-label="Corriger"
      :show-cancel="false"
      confirm-tone="accent"
      @confirm="issuesModalOpen = false"
    >
      <ul class="issues-list">
        <li v-for="(message, i) in issuesMessages" :key="i">{{ message }}</li>
      </ul>
    </ConfirmModal>
  </div>
</template>

<style scoped>
.issues-list {
  margin: 0 0 1rem;
  padding-left: 1.1rem;
  font-size: 0.85rem;
  color: var(--danger);
}

.app-label {
  position: fixed;
  top: 0.6rem;
  left: 0.75rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  opacity: 0.35;
  pointer-events: none;
  z-index: 10;
}

.receipt-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2.75rem 1rem 3rem;
  box-sizing: border-box;
}

.receipt-top {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.receipt-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.back-btn {
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text-muted);
  cursor: pointer;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0;
}

.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.thumb {
  position: relative;
  width: 96px;
  height: 96px;
}

.thumb-open {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.processed {
  cursor: zoom-in;
}

.thumb-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 0.7rem;
  cursor: pointer;
}

.pickers {
  display: flex;
  gap: 0.5rem;
}

.pick-btn {
  flex: 1;
  padding: 0.6rem 0;
  text-align: center;
  font-size: 0.9rem;
  border: 1px solid var(--color-border-hover);
  border-radius: 6px;
  color: var(--color-text);
  cursor: pointer;
}

.pick-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.run-btn {
  padding: 0.6rem 0;
  font-size: 0.9rem;
  border: 1px dashed var(--color-border-hover);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.run-btn:not(:disabled):hover {
  border-color: var(--accent);
  color: var(--accent);
}

.run-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.progress {
  width: 100%;
}

.status,
.duration,
.reason {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  margin: 0;
}

.error {
  font-size: 0.85rem;
  color: var(--danger);
  margin: 0;
}

.receipt-head {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-bottom: -0.5rem;
}

.receipt-head .num {
  text-align: right;
}

.review {
  list-style: none;
  margin: 0;
  padding: 0;
}

.diagnostics {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.diagnostics > summary {
  cursor: pointer;
  margin-bottom: 0.5rem;
}

.totals {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.25rem 0.75rem;
  font-size: 0.85rem;
  margin: 0;
}

.totals dt {
  color: var(--color-text-muted);
}

.totals dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.passes {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  padding-left: 1.1rem;
  margin: 0;
}

.result {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0;
  border-top: 1px solid var(--color-border);
}

.result-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.result-head h3 {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0;
}

.mode-label {
  font-weight: 400;
  color: var(--color-text-muted);
  margin-left: 0.4rem;
}

.processed {
  max-width: 100%;
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.raw-text {
  white-space: pre-wrap;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.8rem;
  line-height: 1.4;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.6rem;
  margin: 0;
  overflow-x: auto;
}
</style>
