<script setup>
import { ref, nextTick, computed } from 'vue'
import IconTrash from './icons/IconTrash.vue'
import IconTrashOpen from './icons/IconTrashOpen.vue'
import IconUndo from './icons/IconUndo.vue'

const props = defineProps({
  todo: {
    type: Object,
    required: true,
  },
  compact: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle', 'remove', 'rename', 'undo'])

const hasTimings = () => (props.todo.timings?.length ?? 0) > 0

const isEditing = ref(false)
const editText = ref('')
const editInputRef = ref(null)
const confirmingDelete = ref(false)

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

const RING_RADIUS = 8
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const ringOffset = computed(() => {
  const p = Math.min(props.todo.progress ?? 0, 1)
  return RING_CIRCUMFERENCE * (1 - p)
})
</script>

<template>
  <div class="item" :class="{ done: todo.done, compact: compact }">
    <button class="check" @click="emit('toggle')" aria-label="Toggle">
      <svg class="ring-svg" width="20" height="20" viewBox="0 0 20 20">
        <circle
          class="ring-track"
          cx="10" cy="10" :r="RING_RADIUS"
          fill="none"
          stroke-width="2"
        />
        <circle
          class="ring-fill"
          cx="10" cy="10" :r="RING_RADIUS"
          fill="none"
          stroke-width="2"
          stroke-linecap="round"
          :stroke-dasharray="RING_CIRCUMFERENCE"
          :stroke-dashoffset="ringOffset"
        />
        <polyline
          v-if="todo.done"
          class="ring-check"
          points="7 10.5 9.5 13 13.5 7.5"
          fill="none"
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
      >{{ todo.text }}</span>
    </div>

    <div class="actions">
      <button
        v-if="hasTimings()"
        class="act"
        @click="emit('undo')"
        aria-label="Annuler"
      >
        <IconUndo />
      </button>
      <button
        class="act act-danger"
        :class="{ 'act-confirm': confirmingDelete }"
        @click="handleDelete"
        @blur="cancelDelete"
        aria-label="Supprimer"
      >
        <IconTrashOpen v-if="confirmingDelete" />
        <IconTrash v-else />
      </button>
    </div>
  </div>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0;
  transition: padding 0.3s, gap 0.3s, opacity 0.3s;
}

.item.compact {
  padding: 0;
  gap: 0.25rem;
  opacity: 0.45;
}

.item.compact .label {
  font-size: 0.8rem;
}

.item.compact .check {
  width: 16px;
  height: 16px;
  min-width: 16px;
}

.item.compact .ring-svg {
  width: 16px;
  height: 16px;
}

.item.compact .actions {
  display: none;
}

.check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  min-width: 22px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
}

.ring-svg {
  display: block;
  transform: rotate(-90deg);
}

.ring-track {
  stroke: var(--color-border);
  transition: stroke 0.3s;
}

.item:hover .ring-track {
  stroke: var(--color-border-hover);
}

.ring-fill {
  stroke: var(--accent);
  transition: stroke-dashoffset 1.5s linear;
}

.item.done .ring-fill {
  opacity: 0.4;
}

.ring-check {
  stroke: var(--accent);
  transform: rotate(90deg);
  transform-origin: center;
}

.body {
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


.actions {
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
</style>
