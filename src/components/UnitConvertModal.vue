<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  fromUnit: { type: String, default: '' },
  toUnit: { type: String, default: '' },
  existingFactor: { type: Number, default: null },
})

const emit = defineEmits(['confirm', 'cancel'])

const factor = ref('')
const inputRef = ref(null)

const fromLabel = computed(() => props.fromUnit || 'achat')
const toLabel = computed(() => props.toUnit || 'achat')

watch(() => props.visible, (v) => {
  if (v) {
    factor.value = props.existingFactor != null ? String(props.existingFactor) : ''
    nextTick(() => {
      inputRef.value?.focus?.()
      inputRef.value?.select?.()
    })
  }
})

const confirm = () => {
  const val = parseFloat(factor.value)
  if (!isNaN(val) && val > 0) {
    emit('confirm', val)
  }
}

const cancel = () => {
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="overlay" @click.self="cancel">
        <div class="modal">
          <h3 class="title">Conversion d'unité</h3>
          <div class="conversion-row">
            <span class="fixed">1 {{ fromLabel }}</span>
            <span class="eq">=</span>
            <input
              ref="inputRef"
              v-model="factor"
              type="number"
              step="any"
              min="0"
              class="factor-input"
              placeholder="?"
              @keydown.enter="confirm"
              @keydown.escape="cancel"
            />
            <span class="to-unit">{{ toLabel }}</span>
          </div>
          <div class="actions">
            <button class="btn btn-cancel" @click="cancel">Annuler</button>
            <button class="btn btn-confirm" @click="confirm" :disabled="!factor || parseFloat(factor) <= 0">Convertir</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
}

.modal {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  min-width: 260px;
  max-width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-heading);
  margin-bottom: 1rem;
}

.conversion-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.fixed {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-heading);
  white-space: nowrap;
}

.eq {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.factor-input {
  width: 4.5rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
  font-family: inherit;
  text-align: center;
  background: var(--color-background-soft);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-heading);
  outline: none;
  transition: border-color 0.2s;
  appearance: textfield;
  -moz-appearance: textfield;
}

.factor-input::-webkit-inner-spin-button,
.factor-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.factor-input:focus {
  border-color: var(--accent);
}

.to-unit {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-heading);
  white-space: nowrap;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn {
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
  font-family: inherit;
  font-weight: 500;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, opacity 0.2s;
}

.btn-cancel {
  background: transparent;
  color: var(--color-text-muted);
}

.btn-cancel:hover {
  color: var(--color-heading);
}

.btn-confirm {
  background: var(--accent);
  color: white;
}

.btn-confirm:hover {
  opacity: 0.9;
}

.btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal {
  transform: scale(0.95);
}

.modal-leave-to .modal {
  transform: scale(0.95);
}
</style>
