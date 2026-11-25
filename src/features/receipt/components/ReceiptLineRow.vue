<script setup>
import { computed } from 'vue'
import ListPicker from '@/components/ui/ListPicker.vue'
import ProductCombobox from './ProductCombobox.vue'
import {
  setLineQuantity,
  setLineUnit,
  setLineTotal,
  parseEuroInput,
  lineIssues,
} from '@/utils/receipt/reviewLines.js'

const props = defineProps({
  line: { type: Object, required: true },
  candidates: { type: Array, required: true },
  lists: { type: Array, required: true },
  defaultListId: { type: String, default: null },
})

const isNew = computed(() => props.line.target?.type === 'new')
const issues = computed(() => lineIssues(props.line))

const euro = (cents) => (cents / 100).toFixed(2)
const euroText = (cents) => `${euro(cents).replace('.', ',')} €`

/** Informations lues sur le ticket qui n'ont pas de colonne propre. */
const details = computed(() => {
  const parts = []
  if (props.line.weightGrams) parts.push(`${(props.line.weightGrams / 1000).toFixed(3).replace('.', ',')} kg`)
  if (props.line.discountCents) parts.push(`remise −${euroText(props.line.discountCents)}`)
  return parts.join(' · ')
})

function onQuantity(event) {
  setLineQuantity(props.line, event.target.value)
  event.target.value = props.line.quantity
}
function onUnit(event) {
  setLineUnit(props.line, parseEuroInput(event.target.value))
  event.target.value = euro(props.line.unitCents)
}
function onTotal(event) {
  setLineTotal(props.line, parseEuroInput(event.target.value))
  event.target.value = euro(props.line.totalCents)
}
function onCategory(listId) {
  props.line.target.listId = listId
}
</script>

<template>
  <li
    class="receipt-grid receipt-row"
    :class="{ excluded: !line.included, incoherent: issues.amounts || issues.product }"
  >
    <input
      v-model="line.included"
      type="checkbox"
      class="cell-include"
      :aria-label="`Inclure ${line.name}`"
    />

    <span class="cell-code" :title="[line.name, details].filter(Boolean).join(' – ')">
      <span class="code-name">
        {{ line.name }}
        <span v-if="line.uncertain" class="flag" title="Lecture peu fiable">?</span>
      </span>
      <span v-if="details" class="code-detail">{{ details }}</span>
    </span>

    <ProductCombobox
      class="cell-product"
      :line="line"
      :candidates="candidates"
      :default-list-id="defaultListId"
      :disabled="!line.included"
      :invalid="issues.product"
    />

    <input
      class="field cell-qty num"
      :class="{ invalid: issues.amounts }"
      type="number"
      min="1"
      step="1"
      inputmode="numeric"
      aria-label="Quantité"
      :value="line.quantity"
      :disabled="!line.included"
      @change="onQuantity"
    />
    <input
      class="field cell-unit num"
      :class="{ invalid: issues.amounts }"
      type="text"
      inputmode="decimal"
      aria-label="Prix unitaire en euros"
      :value="euro(line.unitCents)"
      :disabled="!line.included"
      @change="onUnit"
    />
    <input
      class="field cell-total num"
      :class="{ invalid: issues.amounts }"
      type="text"
      inputmode="decimal"
      aria-label="Prix total en euros"
      :value="euro(line.totalCents)"
      :disabled="!line.included"
      @change="onTotal"
    />

    <ListPicker
      v-if="isNew && line.included"
      class="cell-category"
      :model-value="line.target.listId"
      :items="lists"
      placeholder="Catégorie"
      menu-align="right"
      @update:model-value="onCategory"
    />
  </li>
</template>

<style>
/* Grille partagée avec l'en-tête de la liste (ReceiptView). */
.receipt-grid {
  display: grid;
  grid-template-columns: 1.4rem 8.5rem minmax(11rem, 1fr) 3.4rem 4.6rem 4.6rem 6.5rem;
  align-items: center;
  gap: 0.4rem;
}

@media (max-width: 760px) {
  .receipt-grid {
    grid-template-columns: 1.4rem 1fr 3.4rem 4.6rem 4.6rem;
    grid-template-areas:
      'include code code code code'
      'product product product product product'
      '. qty unit total total'
      '. category category category category';
  }
  .receipt-grid > .cell-include { grid-area: include; }
  .receipt-grid > .cell-code { grid-area: code; }
  .receipt-grid > .cell-product { grid-area: product; }
  .receipt-grid > .cell-qty { grid-area: qty; }
  .receipt-grid > .cell-unit { grid-area: unit; }
  .receipt-grid > .cell-total { grid-area: total; }
  .receipt-grid > .cell-category { grid-area: category; }
  .receipt-head { display: none; }
}
</style>

<style scoped>
.receipt-row {
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.85rem;
}

.receipt-row.excluded {
  opacity: 0.5;
}

.cell-code {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.code-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.65rem;
  opacity: 0.8;
}

.flag {
  margin-left: 0.2rem;
  padding: 0 0.3rem;
  border: 1px solid var(--color-border-hover);
  border-radius: 4px;
}

.field {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  padding: 0.3rem 0.4rem;
  font-size: 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text);
}

.num {
  text-align: right;
}

.field.invalid {
  border-color: var(--danger);
  color: var(--danger);
}

.receipt-row.incoherent .cell-code {
  color: var(--danger);
}
</style>
