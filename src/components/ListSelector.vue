<script setup>
import { ref, nextTick } from 'vue'
import IconTrash from './icons/IconTrash.vue'

const props = defineProps({
  lists: { type: Array, required: true },
  activeListId: { type: String, default: null },
})

const emit = defineEmits(['select', 'add', 'remove', 'rename'])

const showNewList = ref(false)
const newListName = ref('')
const editingListId = ref(null)
const editingName = ref('')
const editInputRef = ref(null)

const createList = () => {
  const name = newListName.value.trim()
  if (name) {
    emit('add', name)
    newListName.value = ''
    showNewList.value = false
  }
}

const cancelNew = () => {
  newListName.value = ''
  showNewList.value = false
}

const startEdit = (list, event) => {
  event.stopPropagation()
  editingListId.value = list.id
  editingName.value = list.name
  nextTick(() => {
    const el = Array.isArray(editInputRef.value) ? editInputRef.value[0] : editInputRef.value
    el?.focus?.()
    el?.select?.()
  })
}

const saveEdit = () => {
  if (editingListId.value) {
    emit('rename', editingListId.value, editingName.value.trim() || 'Sans nom')
    editingListId.value = null
    editingName.value = ''
  }
}

const cancelEdit = () => {
  editingListId.value = null
  editingName.value = ''
}
</script>

<template>
  <div class="list-selector">
    <div class="tabs">
      <div
        v-for="list in lists"
        :key="list.id"
        class="tab"
        :class="{ active: list.id === activeListId }"
        @click="editingListId !== list.id && emit('select', list.id)"
        role="button"
        tabindex="0"
        @keydown.enter="editingListId !== list.id && emit('select', list.id)"
      >
        <input
          v-if="editingListId === list.id"
          ref="editInputRef"
          v-model="editingName"
          type="text"
          class="tab-input"
          @blur="saveEdit"
          @keydown.enter="saveEdit"
          @keydown.escape="cancelEdit"
          @click.stop
        />
        <span
          v-else
          class="tab-name"
          @dblclick.stop="startEdit(list, $event)"
        >
          {{ list.name }}
        </span>
        <button
          v-if="lists.length > 1 && editingListId === list.id"
          class="remove-tab"
          aria-label="Supprimer la liste"
          @mousedown.prevent.stop="emit('remove', list.id)"
        >
          <IconTrash />
        </button>
      </div>
      <div v-if="showNewList" class="new-list-form">
        <input
          v-model="newListName"
          type="text"
          placeholder="Nom de la liste"
          class="new-list-input"
          @keydown.enter="createList"
          @keydown.escape="cancelNew"
        />
        <button class="btn-confirm" @click="createList">Créer</button>
        <button class="btn-cancel" @click="cancelNew">Annuler</button>
      </div>
      <button v-else class="tab add-tab" @click="showNewList = true">
        + Nouvelle liste
      </button>
    </div>
  </div>
</template>

<style scoped>
.list-selector {
  margin-bottom: 1.5rem;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  font-family: inherit;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  transition: 0.4s;
}

.tab:hover {
  border-color: var(--color-border-hover);
}

.tab-name {
  flex: 1;
  min-width: 0;
}

.tab-input {
  flex: 1;
  min-width: 80px;
  padding: 0;
  font-size: inherit;
  font-family: inherit;
  background: transparent;
  border: none;
  color: inherit;
  outline: none;
}

.tab.active {
  border-color: hsla(160, 100%, 37%, 1);
  color: hsla(160, 100%, 37%, 1);
  background: hsla(160, 100%, 37%, 0.1);
}

.add-tab {
  border-style: dashed;
  opacity: 0.8;
}

.add-tab:hover {
  opacity: 1;
  border-color: hsla(160, 100%, 37%, 0.5);
}

.remove-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.5;
}

.remove-tab:hover {
  opacity: 1;
  color: #e74c3c;
}

.new-list-form {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.new-list-input {
  padding: 0.5rem 0.75rem;
  font-size: 0.95rem;
  font-family: inherit;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  color: var(--color-text);
  min-width: 150px;
}

.new-list-input:focus {
  outline: none;
  border-color: hsla(160, 100%, 37%, 0.5);
}

.btn-confirm,
.btn-cancel {
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  font-family: inherit;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.4s;
}

.btn-confirm {
  border: 1px solid hsla(160, 100%, 37%, 1);
  background: transparent;
  color: hsla(160, 100%, 37%, 1);
}

.btn-confirm:hover {
  background: hsla(160, 100%, 37%, 0.2);
}

.btn-cancel {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
}

.btn-cancel:hover {
  border-color: var(--color-border-hover);
}
</style>
