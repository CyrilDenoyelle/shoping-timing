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

const progressPercent = computed(() => {
  if (!props.todo.done) return 0
  return Math.min(props.todo.progress ?? 0, 1) * 100
})
</script>

<template>
  <div class="item" :class="{ done: todo.done, compact: compact }">
    <div
      v-if="todo.done"
      class="progress-bar"
      :style="{ width: progressPercent + '%' }"
    />

    <button class="check" @click="emit('toggle')" aria-label="Toggle">
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
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.35rem;
  transition: padding 0.3s, gap 0.3s, opacity 0.3s;
  overflow: hidden;
  border-radius: 6px;
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
</style>
