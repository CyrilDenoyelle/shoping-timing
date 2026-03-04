<script setup>
import { ref, nextTick } from 'vue'
import IconTrash from './icons/IconTrash.vue'
import IconUndo from './icons/IconUndo.vue'

const props = defineProps({
  todo: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['toggle', 'remove', 'rename', 'undo'])

const hasTimings = () => (props.todo.timings?.length ?? 0) > 0

const isEditing = ref(false)
const editText = ref('')
const editInputRef = ref(null)

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
</script>

<template>
  <div class="item" :class="{ done: todo.done }">
    <button class="check" @click="emit('toggle')" aria-label="Toggle">
      <svg
        v-if="todo.done"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span v-else class="circle"></span>
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

      <div class="bar">
        <div
          class="bar-fill"
          :style="{ width: `${Math.min((todo.progress ?? 0) * 100, 100)}%` }"
        ></div>
      </div>
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
      <button class="act act-danger" @click="emit('remove')" aria-label="Supprimer">
        <IconTrash />
      </button>
    </div>
  </div>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0;
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
  color: var(--color-text-muted);
  cursor: pointer;
  transition: color 0.3s;
}

.item.done .check {
  color: var(--accent);
}

.circle {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--color-border-hover);
  border-radius: 50%;
  transition: border-color 0.3s;
}

.item:hover .circle {
  border-color: var(--accent);
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
  opacity: 0.4;
  text-decoration: line-through;
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

.bar {
  margin-top: 0.3rem;
  height: 3px;
  background: var(--color-border);
  border-radius: 1.5px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 1.5px;
  transition: width 1.5s linear;
}

.item.done .bar-fill {
  opacity: 0.35;
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
</style>
