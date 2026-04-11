<script setup>
import { ref, nextTick, computed } from 'vue'
import IconTrash from './icons/IconTrash.vue'
import IconTrashOpen from './icons/IconTrashOpen.vue'
import { UNITS, needsConversionModal, getBaseUnit, unitScale } from '../composables/useTodoStorage'
import UnitConvertModal from './UnitConvertModal.vue'

const props = defineProps({
  todo: {
    type: Object,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  shoppingMode: {
    type: Boolean,
    default: false,
  },
  reorderable: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle', 'remove', 'rename', 'set-quantity', 'set-unit'])

const isEditing = ref(false)
const editText = ref('')
const editInputRef = ref(null)
const confirmingDelete = ref(false)
const editingQty = ref(false)
const editQtyValue = ref('')
const editQtyRef = ref(null)
const unitDropdownOpen = ref(false)

const handleDelete = () => {
  if (confirmingDelete.value) {
    emit('remove')
    confirmingDelete.value = false
  } else {
    confirmingDelete.value = true
  }
}

const cancelDelete = () => {
  confirmingDelete.value = false
}

const startEdit = () => {
  isEditing.value = true
  editText.value = props.todo.text
  nextTick(() => {
    editInputRef.value?.focus?.()
    editInputRef.value?.select?.()
  })
}

const saveEdit = () => {
  if (isEditing.value) {
    emit('rename', props.todo.id, editText.value.trim() || 'Sans titre')
    isEditing.value = false
  }
}

const cancelEdit = () => {
  isEditing.value = false
  editText.value = ''
}

const progressPercent = computed(() => {
  if (!props.todo.done) return 0
  return Math.min(props.todo.progress ?? 0, 1) * 100
})

const hasQtyOrUnit = computed(() => {
  const q = props.todo.quantity ?? 1
  const u = props.todo.unit ?? ''
  return q !== 1 || u !== ''
})

const formatQty = computed(() => {
  const q = props.todo.quantity ?? 1
  const u = props.todo.unit ?? ''
  const num = Number.isInteger(q) ? q : q.toFixed(1)
  return u ? `${num} ${u}` : `${num}`
})

const startEditQty = () => {
  editingQty.value = true
  editQtyValue.value = String(props.todo.quantity ?? 1)
  nextTick(() => {
    editQtyRef.value?.focus?.()
    editQtyRef.value?.select?.()
  })
}

const saveEditQty = () => {
  if (editingQty.value) {
    const val = parseFloat(editQtyValue.value)
    if (!isNaN(val) && val > 0) {
      emit('set-quantity', val)
    }
    editingQty.value = false
  }
}

const cancelEditQty = () => {
  editingQty.value = false
}

const increment = () => emit('set-quantity', (props.todo.quantity ?? 1) + 1)
const decrement = () => emit('set-quantity', Math.max(0.1, (props.todo.quantity ?? 1) - 1))

const pendingUnit = ref(null)
const showConvertModal = ref(false)
const existingFactor = ref(null)

const toggleUnitDropdown = () => {
  unitDropdownOpen.value = !unitDropdownOpen.value
}

const selectUnit = (unit) => {
  unitDropdownOpen.value = false
  const oldUnit = props.todo.unit ?? ''
  if (needsConversionModal(oldUnit, unit)) {
    pendingUnit.value = unit
    const fromBase = getBaseUnit(oldUnit)
    const toBase = getBaseUnit(unit)
    const key = `${fromBase}:${toBase}`
    const reverse = `${toBase}:${fromBase}`
    const convs = props.todo.conversions ?? {}
    const baseFwd = convs[key] ?? (convs[reverse] ? 1 / convs[reverse] : null)
    existingFactor.value = baseFwd != null
      ? baseFwd * unitScale(oldUnit) / unitScale(unit)
      : null
    showConvertModal.value = true
  } else {
    emit('set-unit', unit)
  }
}

const onConvertConfirm = (factor, newQty) => {
  emit('set-unit', pendingUnit.value, factor, newQty)
  showConvertModal.value = false
  pendingUnit.value = null
}

const onConvertCancel = () => {
  showConvertModal.value = false
  pendingUnit.value = null
}

const closeUnitDropdown = () => {
  unitDropdownOpen.value = false
}

const unitLabel = (u) => u === '' ? '—' : u

const onRowClick = () => {
  if (!props.shoppingMode || isEditing.value) return
  emit('toggle')
}

</script>

<template>
  <div class="item" :class="{ done: todo.done, compact: compact, 'shopping': shoppingMode, 'reorderable': reorderable }" @click="onRowClick">
    <div
      v-if="todo.done"
      class="progress-bar"
      :style="{ width: (100 - progressPercent) + '%' }"
    />

    <span v-if="reorderable" class="drag-grip" aria-label="Glisser pour réordonner">⠿</span>

    <button class="check" @click.stop="emit('toggle')" aria-label="Toggle">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect
          class="check-box"
          x="1" y="1" width="14" height="14" rx="3"
          stroke-width="1.5"
        />
        <polyline
          v-if="todo.done"
          class="check-tick"
          points="4.5 8.5 7 11 11.5 5.5"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div class="body">
      <input
        v-if="isEditing"
        ref="editInputRef"
        v-model="editText"
        type="text"
        class="edit-input"
        @blur="saveEdit"
        @keydown.enter="saveEdit"
        @keydown.escape="cancelEdit"
      />
      <span
        v-else
        class="label"
        @dblclick.stop="startEdit"
      >{{ todo.text }}<span v-if="todo.formattedInterval" class="interval">{{ todo.formattedInterval }}</span></span>
    </div>

    <div v-if="!compact && !todo.done" class="stepper" :class="{ 'stepper-idle': !hasQtyOrUnit }" @click.stop>
      <template v-if="hasQtyOrUnit || editingQty">
        <button class="step-btn" @click="decrement" aria-label="Moins">−</button>
        <input
          v-if="editingQty"
          ref="editQtyRef"
          v-model="editQtyValue"
          type="number"
          step="any"
          min="0.1"
          class="qty-input"
          @blur="saveEditQty"
          @keydown.enter="saveEditQty"
          @keydown.escape="cancelEditQty"
        />
        <span v-else class="qty-display" @click="startEditQty">{{ formatQty }}</span>
        <button class="step-btn" @click="increment" aria-label="Plus">+</button>
      </template>
      <div class="unit-wrapper">
        <button
          class="unit-btn"
          :class="{ 'unit-btn-active': unitDropdownOpen }"
          @click="toggleUnitDropdown"
          @blur="closeUnitDropdown"
          aria-label="Changer unité"
        >{{ todo.unit || '⊕' }}</button>
        <div v-if="unitDropdownOpen" class="unit-dropdown" @mousedown.prevent>
          <button
            v-for="u in UNITS"
            :key="u"
            class="unit-option"
            :class="{ 'unit-option-active': (todo.unit ?? '') === u }"
            @click="selectUnit(u)"
          >{{ unitLabel(u) }}</button>
        </div>
      </div>
    </div>

    <div class="actions">
      <button
        class="act act-danger"
        :class="{ 'act-confirm': confirmingDelete }"
        @click.stop="handleDelete"
        @blur="cancelDelete"
        aria-label="Supprimer"
      >
        <IconTrashOpen v-if="confirmingDelete" />
        <IconTrash v-else />
      </button>
    </div>

    <UnitConvertModal
      :visible="showConvertModal"
      :from-unit="todo.unit ?? ''"
      :to-unit="pendingUnit ?? ''"
      :existing-factor="existingFactor"
      :current-interval-ms="todo.averageIntervalMs"
      :current-quantity="todo.quantity ?? 1"
      @confirm="onConvertConfirm"
      @cancel="onConvertCancel"
    />
  </div>
</template>

<style scoped>
.item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.35rem;
  transition: padding 0.3s, gap 0.3s, opacity 0.3s;
  border-radius: 6px;
}

.item.shopping {
  cursor: pointer;
}

.item.compact {
  padding: 0 0.35rem;
  gap: 0.25rem;
  opacity: 0.45;
}

.item.compact .label {
  font-size: 0.8rem;
}

.item.compact .check {
  width: 14px;
  height: 14px;
  min-width: 14px;
}

.item.compact .check svg {
  width: 14px;
  height: 14px;
}

.item.compact .actions {
  display: none;
}

.progress-bar {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 0;
  width: 0;
  background: var(--accent);
  opacity: 0.08;
  border-radius: 6px;
  transition: width 1.2s ease;
  pointer-events: none;
}

.check {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  min-width: 18px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
}

.check-box {
  stroke: var(--color-border);
  fill: none;
  transition: stroke 0.3s;
}

.item:hover .check-box {
  stroke: var(--color-border-hover);
}

.item.done .check-box {
  stroke: var(--accent);
  opacity: 0.5;
}

.check-tick {
  stroke: var(--accent);
}

.body {
  position: relative;
  flex: 1;
  min-width: 0;
}

.label {
  display: block;
  font-size: 0.95rem;
  color: var(--color-heading);
  cursor: text;
  transition: opacity 0.3s;
}

.item.done .label {
  opacity: 0.6;
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, currentColor 80%, transparent);
}

.interval {
  margin-left: 0.4rem;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  opacity: 0.7;
  font-weight: 400;
  white-space: nowrap;
}

.item.compact .interval {
  display: none;
}

.edit-input {
  display: block;
  width: 100%;
  padding: 0;
  font-size: 0.95rem;
  font-family: inherit;
  background: transparent;
  border: none;
  color: var(--color-heading);
  outline: none;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  margin-left: auto;
}

.step-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: none;
  border: none;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
  user-select: none;
}

.item:hover .step-btn,
.item:active .step-btn {
  opacity: 1;
}

.step-btn:hover {
  color: var(--accent);
}

@media (hover: none) {
  .step-btn {
    opacity: 0.7;
  }
}

.qty-display {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  opacity: 0.7;
  white-space: nowrap;
  cursor: pointer;
  padding: 0 0.15rem;
  min-width: 1.2rem;
  text-align: center;
  user-select: none;
}

.qty-display:hover {
  opacity: 1;
  color: var(--accent);
}

.qty-input {
  width: 3rem;
  padding: 0;
  font-size: 0.7rem;
  font-family: inherit;
  text-align: center;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--accent);
  color: var(--color-heading);
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
}

.qty-input::-webkit-inner-spin-button,
.qty-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.unit-wrapper {
  position: relative;
}

.unit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.15rem 0.35rem;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.65rem;
  font-family: inherit;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: opacity 0.2s, color 0.2s, border-color 0.2s, background 0.2s;
  white-space: nowrap;
  user-select: none;
  min-width: 1.6rem;
  text-align: center;
}

.unit-btn:hover,
.unit-btn-active {
  border-color: var(--accent);
  color: var(--accent);
}

.unit-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  display: flex;
  flex-direction: column;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  z-index: 20;
  min-width: 3.5rem;
  padding: 0.2rem;
  gap: 0.1rem;
}

.unit-option {
  display: block;
  width: 100%;
  padding: 0.3rem 0.5rem;
  background: none;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  font-family: inherit;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.unit-option:hover {
  background: var(--color-border);
}

.unit-option-active {
  color: var(--accent);
  font-weight: 600;
}

.stepper-idle .unit-btn {
  opacity: 0;
  transition: opacity 0.2s, color 0.2s, border-color 0.2s;
}

.item:hover .stepper-idle .unit-btn {
  opacity: 0.6;
}

@media (hover: none) {
  .stepper-idle .unit-btn {
    opacity: 0.5;
  }
}

.actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.15rem;
  transition: opacity 0.25s;
}

@media (hover: hover) {
  .actions {
    opacity: 0;
  }

  .item:hover .actions {
    opacity: 1;
  }
}

.act {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.25s;
}

.act:hover {
  color: var(--accent);
}

.act-danger:hover {
  color: var(--danger);
}

.act-confirm {
  color: var(--danger) !important;
  transform: scale(1.3);
  transition: color 0.2s, transform 0.2s;
}

.drag-grip {
  cursor: grab;
  user-select: none;
  font-size: 0.75rem;
  line-height: 1;
  color: var(--color-text-muted);
  opacity: 0.35;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.drag-grip:hover {
  opacity: 0.8;
}

.drag-grip:active {
  cursor: grabbing;
}
</style>
