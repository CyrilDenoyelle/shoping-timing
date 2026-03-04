<script setup>
import { ref, nextTick } from 'vue'
import TodoItem from './TodoItem.vue'
import TodoInput from './TodoInput.vue'
import IconTrash from './icons/IconTrash.vue'
import { useTodoStorage } from '../composables/useTodoStorage'

const {
  displayLists,
  addList,
  removeList,
  renameList,
  moveList,
  addTodo,
  toggleTodo,
  removeTodo,
  renameTodo,
  undoLastTiming,
} = useTodoStorage()

const showNewList = ref(false)
const newListName = ref('')
const editingListId = ref(null)
const editingName = ref('')
const editInputRef = ref(null)
const newListInputRef = ref(null)

const createList = () => {
  const name = newListName.value.trim()
  if (name) {
    addList(name)
    newListName.value = ''
    showNewList.value = false
  }
}

const cancelNew = () => {
  newListName.value = ''
  showNewList.value = false
}

const openNewList = () => {
  showNewList.value = true
  nextTick(() => newListInputRef.value?.focus?.())
}

const startEditList = (list) => {
  editingListId.value = list.id
  editingName.value = list.name
  nextTick(() => {
    const el = Array.isArray(editInputRef.value) ? editInputRef.value[0] : editInputRef.value
    el?.focus?.()
    el?.select?.()
  })
}

const saveEditList = () => {
  if (editingListId.value) {
    renameList(editingListId.value, editingName.value.trim() || 'Sans nom')
    editingListId.value = null
    editingName.value = ''
  }
}

const cancelEditList = () => {
  editingListId.value = null
  editingName.value = ''
}

const draggedIndex = ref(null)
const dragOverIndex = ref(null)

const onDragStart = (index, e) => {
  draggedIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(index))
}

const onDragOver = (index, e) => {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = index
}

const onDragLeave = () => {
  dragOverIndex.value = null
}

const onDrop = (index) => {
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    moveList(draggedIndex.value, index)
  }
  draggedIndex.value = null
  dragOverIndex.value = null
}

const onDragEnd = () => {
  draggedIndex.value = null
  dragOverIndex.value = null
}
</script>

<template>
  <div class="lists">
    <section
      v-for="(list, index) in displayLists"
      :key="list.id"
      class="section"
      :class="{
        'is-dragging': draggedIndex === index,
        'drag-over': dragOverIndex === index && draggedIndex !== index,
      }"
      draggable="true"
      @dragstart="onDragStart(index, $event)"
      @dragover="onDragOver(index, $event)"
      @dragleave="onDragLeave"
      @drop="onDrop(index)"
      @dragend="onDragEnd"
    >
      <div class="section-header">
        <span class="drag-handle" aria-label="Glisser pour réordonner">⠿</span>
        <input
          v-if="editingListId === list.id"
          ref="editInputRef"
          v-model="editingName"
          type="text"
          class="title-input"
          @blur="saveEditList"
          @keydown.enter="saveEditList"
          @keydown.escape="cancelEditList"
        />
        <h2
          v-else
          class="title"
          @dblclick="startEditList(list)"
        >
          {{ list.name }}
        </h2>
        <button
          v-if="editingListId === list.id && displayLists.length > 1"
          class="delete-list"
          aria-label="Supprimer la liste"
          @mousedown.prevent.stop="removeList(list.id)"
        >
          <IconTrash />
        </button>
      </div>

      <TransitionGroup name="fade" tag="div" class="items">
        <TodoItem
          v-for="todo in list.displayTodos"
          :key="todo.id"
          :todo="todo"
          @toggle="toggleTodo(list.id, todo.id)"
          @remove="removeTodo(list.id, todo.id)"
          @rename="(id, text) => renameTodo(list.id, id, text)"
          @undo="undoLastTiming(list.id, todo.id)"
        />
      </TransitionGroup>

      <TodoInput @add="(text) => addTodo(list.id, text)" />
    </section>

    <div class="add-section">
      <div v-if="showNewList" class="new-form">
        <input
          ref="newListInputRef"
          v-model="newListName"
          type="text"
          placeholder="Nom de la liste"
          class="new-input"
          @keydown.enter="createList"
          @keydown.escape="cancelNew"
          @blur="cancelNew"
        />
      </div>
      <button v-else class="add-btn" @click="openNewList">
        + Nouvelle liste
      </button>
    </div>
  </div>
</template>

<style scoped>
.lists {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section {
  position: relative;
  border-radius: 8px;
  padding: 0.5rem;
  margin: -0.5rem;
  transition: opacity 0.25s, box-shadow 0.25s, background 0.25s;
}

.section.is-dragging {
  opacity: 0.4;
}

.section.drag-over {
  box-shadow: 0 -2px 0 0 var(--accent);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.drag-handle {
  cursor: grab;
  user-select: none;
  font-size: 1rem;
  line-height: 1;
  color: var(--color-text-muted);
  opacity: 0.4;
  transition: opacity 0.25s;
}

.drag-handle:hover {
  opacity: 0.8;
}

.drag-handle:active {
  cursor: grabbing;
}

.title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  cursor: text;
}

.title-input {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: inherit;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  outline: none;
}

.delete-list {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.25s, color 0.25s;
}

.delete-list:hover {
  opacity: 1;
  color: var(--danger);
}

.items {
  position: relative;
}

.fade-move,
.fade-enter-active,
.fade-leave-active {
  transition: all 0.35s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.fade-leave-active {
  position: absolute;
  width: 100%;
}

.empty {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  padding: 0.75rem 0;
}

.add-section {
  padding-top: 0.25rem;
}

.add-btn {
  display: block;
  width: 100%;
  padding: 0.6rem 0;
  font-size: 0.85rem;
  font-family: inherit;
  font-weight: 500;
  letter-spacing: 0.02em;
  border: 1px dashed var(--color-border-hover);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: 0.3s;
}

.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.new-form {
  display: flex;
}

.new-input {
  flex: 1;
  padding: 0.55rem 0;
  font-size: 0.85rem;
  font-family: inherit;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  outline: none;
  transition: border-color 0.3s;
}

.new-input:focus {
  border-color: var(--accent);
}
</style>
