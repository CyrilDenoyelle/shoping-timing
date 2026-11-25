<script setup>
import { computed } from 'vue'
import { reviewIssues, parseEuroInput } from '@/utils/receipt/reviewLines.js'

const props = defineProps({
  lines: { type: Array, required: true },
  declaredTotalCents: { type: Number, default: null },
  canValidate: { type: Boolean, default: false },
  report: { type: Object, default: null },
})

const emit = defineEmits(['validate', 'done', 'update:declaredTotalCents'])

function formatEuro(cents) {
  if (cents == null) return '—'
  const sign = cents < 0 ? '-' : ''
  return `${sign}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')} €`
}

const included = computed(() => props.lines.filter((line) => line.included))
const issues = computed(() => reviewIssues(props.lines, props.declaredTotalCents))
const existingCount = computed(() => included.value.filter((l) => l.target?.type === 'existing').length)
const newCount = computed(() => included.value.filter((l) => l.target?.type === 'new').length)

const declaredText = computed(() =>
  props.declaredTotalCents == null ? '' : (props.declaredTotalCents / 100).toFixed(2),
)

/** Le total du ticket se corrige à la main quand la lecture est fausse ; une saisie vide le déclare inconnu. */
function onDeclaredChange(event) {
  const raw = event.target.value.trim()
  emit('update:declaredTotalCents', raw === '' ? null : parseEuroInput(raw))
}
</script>

<template>
  <section class="summary">
    <h2 class="title">Récapitulatif</h2>

    <dl class="totals">
      <dt>Lignes retenues</dt>
      <dd>{{ included.length }} / {{ lines.length }}</dd>
      <dt>Produits existants</dt>
      <dd>{{ existingCount }}</dd>
      <dt>Nouveaux produits</dt>
      <dd>{{ newCount }}</dd>
      <dt>Total des lignes</dt>
      <dd :class="{ gap: issues.gap }">{{ formatEuro(issues.sumCents) }}</dd>
      <dt>Total du ticket</dt>
      <dd>
        <input
          class="declared"
          :class="{ gap: issues.gap }"
          type="text"
          inputmode="decimal"
          placeholder="à saisir"
          aria-label="Total du ticket en euros"
          :value="declaredText"
          :disabled="Boolean(report)"
          @change="onDeclaredChange"
        />
      </dd>
      <template v-if="issues.gapCents != null">
        <dt>Écart</dt>
        <dd :class="{ gap: issues.gap }">{{ formatEuro(issues.gapCents) }}</dd>
      </template>
    </dl>

    <ul v-if="!report && issues.hasIssues" class="issue-hints">
      <li v-for="(message, i) in issues.messages" :key="i">{{ message }}</li>
    </ul>

    <template v-if="!report">
      <button type="button" class="validate" :disabled="!canValidate" @click="emit('validate')">
        Valider les achats
      </button>
      <p v-if="!canValidate" class="hint">Retiens au moins une ligne pour valider les achats.</p>
    </template>

    <template v-else>
      <p class="done-text">
        Achats enregistrés : {{ report.checked }} coché(s), {{ report.recorded }} nouvel(s) achat(s)
        daté(s), {{ report.skipped }} déjà acheté(s) aujourd’hui, {{ report.created }} produit(s) créé(s).
      </p>
      <ul class="entries">
        <li v-for="entry in report.entries" :key="entry.todoId">
          <span>{{ entry.productText }}<template v-if="entry.quantity > 1"> × {{ entry.quantity }}</template></span>
          <span class="amount">{{ formatEuro(entry.totalCents) }}</span>
        </li>
      </ul>
      <button type="button" class="validate" @click="$emit('done')">Retour aux listes</button>
    </template>
  </section>
</template>

<style scoped>
.summary {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.title {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0;
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

.gap {
  color: var(--danger);
}

.declared {
  width: 5.5rem;
  box-sizing: border-box;
  padding: 0.25rem 0.4rem;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  background: var(--color-background);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.declared.gap {
  border-color: var(--danger);
  color: var(--danger);
}

.validate {
  padding: 0.7rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
}

.validate:disabled {
  opacity: 0.45;
  cursor: default;
}

.hint,
.done-text {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.issue-hints {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  color: var(--danger);
}

.entries {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.85rem;
}

.entries li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--color-border);
}

.amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
