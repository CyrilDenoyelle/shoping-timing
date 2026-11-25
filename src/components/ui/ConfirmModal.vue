<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirmer' },
  cancelLabel: { type: String, default: 'Annuler' },
  showCancel: { type: Boolean, default: true },
  confirmTone: { type: String, default: 'danger' }, // 'danger' | 'accent'
})
const emit = defineEmits(['confirm', 'cancel'])

const cancelButton = ref(null)
const confirmButton = ref(null)

function onKeydown(event) {
  if (event.key === 'Escape') emit(props.showCancel ? 'cancel' : 'confirm')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  ;(cancelButton.value ?? confirmButton.value)?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="backdrop" @click.self="emit(showCancel ? 'cancel' : 'confirm')">
    <div class="modal" role="alertdialog" aria-modal="true" :aria-label="title">
      <h2 class="title">{{ title }}</h2>
      <p v-if="message" class="message">{{ message }}</p>
      <slot />
      <div class="actions">
        <button v-if="showCancel" ref="cancelButton" type="button" class="btn" @click="emit('cancel')">
          {{ cancelLabel }}
        </button>
        <button
          ref="confirmButton"
          type="button"
          class="btn"
          :class="confirmTone === 'accent' ? 'accent' : 'danger'"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.6);
}

.modal {
  width: min(22rem, 100%);
  padding: 1.1rem;
  border: 1px solid var(--color-border-hover);
  border-radius: 12px;
  background: var(--color-background-soft);
  color: var(--color-text);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
}

.title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.message {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn {
  padding: 0.55rem 1rem;
  font-size: 0.9rem;
  border: 1px solid var(--color-border-hover);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}

.btn.danger {
  border-color: var(--danger);
  color: var(--danger);
}

.btn.accent {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
