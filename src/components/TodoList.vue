<script setup>
import { ref, nextTick } from 'vue'
import TodoItem from './TodoItem.vue'
import TodoInput from './TodoInput.vue'
import QuickAddTodo from './QuickAddTodo.vue'
import IconTrash from './icons/IconTrash.vue'
import { useTodoStorage } from '../composables/useTodoStorage'

const {
  lists,
  displayLists,
  shoppingMode,
  manualSort,
  shoppingManualSort,
  shoppingTodos,
  allTodoTexts,
  addList,
  removeList,
  renameList,
  moveList,
  moveTodo,
  moveShoppingTodo,
  addTodo,
  toggleTodo,
  removeTodo,
  renameTodo,
  setQuantity,
  setUnit,
  undoTodoAction,
  redoTodoAction,
  canUndoTodo,
  canRedoTodo,
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

const scrollToTodo = async (listId, todoId) => {
  await nextTick()
  const key = `${listId}-${todoId}`
  const el = document.querySelector(`[data-todo-id="${key}"]`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('highlight-flash')
  setTimeout(() => el.classList.remove('highlight-flash'), 5000)
}

const draggedTodoListId = ref(null)
const draggedTodoIndex = ref(null)
const dragOverTodoKey = ref(null)
const dragOverHalf = ref(null)
const dragOverListZone = ref(null)

const isDraggingTodo = () => draggedTodoListId.value !== null

const onTodoDragStart = (listId, index, e) => {
  if (!manualSort.value) return
  e.stopPropagation()
  draggedTodoListId.value = listId
  draggedTodoIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', `todo:${listId}:${index}`)
}

const onTodoDragOver = (listId, index, e) => {
  if (!manualSort.value || !isDraggingTodo()) return
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'move'
  const rect = e.currentTarget.getBoundingClientRect()
  const half = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after'
  dragOverTodoKey.value = `${listId}-${index}`
  dragOverHalf.value = half
  dragOverListZone.value = null
}

const onTodoDragLeave = (e) => {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    dragOverTodoKey.value = null
    dragOverHalf.value = null
  }
}

const computeDropIndex = (fromListId, fromIdx, toListId, targetIdx, half) => {
  const sameList = fromListId === toListId
  if (half === 'before') {
    if (sameList && fromIdx < targetIdx) return targetIdx - 1
    return targetIdx
  }
  if (sameList && fromIdx > targetIdx) return targetIdx + 1
  return targetIdx
}

const onTodoDrop = (listId, index, e) => {
  e.stopPropagation()
  if (draggedTodoIndex.value === null) return
  const fromList = draggedTodoListId.value
  const fromIdx = draggedTodoIndex.value
  const half = dragOverHalf.value ?? 'before'
  const toIdx = computeDropIndex(fromList, fromIdx, listId, index, half)
  if (fromList === listId && fromIdx === toIdx) {
    resetTodoDrag()
    return
  }
  moveTodo(fromList, fromIdx, listId, toIdx)
  resetTodoDrag()
}

const onListZoneDragOver = (listId, e) => {
  if (!manualSort.value || !isDraggingTodo()) return
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'move'
  dragOverListZone.value = listId
  dragOverTodoKey.value = null
  dragOverHalf.value = null
}

const onListZoneDrop = (listId, todoCount, e) => {
  e.stopPropagation()
  if (draggedTodoIndex.value === null) return
  const fromList = draggedTodoListId.value
  const fromIdx = draggedTodoIndex.value
  const toIdx = fromList === listId ? todoCount - 1 : todoCount
  moveTodo(fromList, fromIdx, listId, toIdx)
  resetTodoDrag()
}

const onListZoneDragLeave = () => {
  dragOverListZone.value = null
}

const resetTodoDrag = () => {
  draggedTodoListId.value = null
  draggedTodoIndex.value = null
  dragOverTodoKey.value = null
  dragOverHalf.value = null
  dragOverListZone.value = null
}

const onTodoDragEnd = () => {
  resetTodoDrag()
}

const draggedShoppingIndex = ref(null)
const dragOverShoppingKey = ref(null)
const dragOverShoppingHalf = ref(null)

const onShoppingDragStart = (index, e) => {
  if (!shoppingManualSort.value) return
  e.stopPropagation()
  draggedShoppingIndex.value = index
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', `shopping:${index}`)
}

const onShoppingDragOver = (index, e) => {
  if (!shoppingManualSort.value || draggedShoppingIndex.value === null) return
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer.dropEffect = 'move'
  const rect = e.currentTarget.getBoundingClientRect()
  dragOverShoppingHalf.value = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after'
  dragOverShoppingKey.value = index
}

const onShoppingDragLeave = (e) => {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    dragOverShoppingKey.value = null
    dragOverShoppingHalf.value = null
  }
}

const onShoppingDrop = (index, e) => {
  e.stopPropagation()
  if (draggedShoppingIndex.value === null) return
  const fromIdx = draggedShoppingIndex.value
  const half = dragOverShoppingHalf.value ?? 'before'
  let toIdx = half === 'before' ? index : index + 1
  if (fromIdx < toIdx) toIdx--
  if (fromIdx !== toIdx) moveShoppingTodo(fromIdx, toIdx)
  resetShoppingDrag()
}

const resetShoppingDrag = () => {
  draggedShoppingIndex.value = null
  dragOverShoppingKey.value = null
  dragOverShoppingHalf.value = null
}

const onShoppingDragEnd = () => {
  resetShoppingDrag()
}
</script>

<template>
  <div class="lists">
    <QuickAddTodo
      :lists="lists"
      :suggestions="allTodoTexts"
      @add="(listId, text) => addTodo(listId, text)"
      @navigate="scrollToTodo"
    />

    <section v-if="shoppingMode && shoppingTodos.length" class="section shopping-section">
      <TransitionGroup name="fade" tag="div" class="items">
        <div
          v-for="(todo, si) in shoppingTodos"
          :key="'s-' + todo.id"
          :data-todo-id="todo.listId + '-' + todo.id"
          :draggable="shoppingManualSort"
          :class="{
            'todo-dragging': shoppingManualSort && draggedShoppingIndex === si,
            'todo-drag-before': shoppingManualSort && dragOverShoppingKey === si && dragOverShoppingHalf === 'before' && draggedShoppingIndex !== si,
            'todo-drag-after': shoppingManualSort && dragOverShoppingKey === si && dragOverShoppingHalf === 'after' && draggedShoppingIndex !== si,
          }"
          @dragstart="onShoppingDragStart(si, $event)"
          @dragover="onShoppingDragOver(si, $event)"
          @dragleave="onShoppingDragLeave($event)"
          @drop="onShoppingDrop(si, $event)"
          @dragend="onShoppingDragEnd"
        >
          <TodoItem
            :todo="todo"
            :shopping-mode="true"
            :reorderable="shoppingManualSort"
            :can-undo="canUndoTodo(todo.id)"
            :can-redo="canRedoTodo(todo.id)"
            @toggle="toggleTodo(todo.listId, todo.id)"
            @remove="removeTodo(todo.listId, todo.id)"
            @rename="(id, text) => renameTodo(todo.listId, id, text)"
            @set-quantity="(qty) => setQuantity(todo.listId, todo.id, qty)"
            @set-unit="(unit, factor, newQty) => setUnit(todo.listId, todo.id, unit, factor, newQty)"
            @undo="undoTodoAction(todo.listId, todo.id)"
            @redo="redoTodoAction(todo.listId, todo.id)"
          />
        </div>
      </TransitionGroup>
    </section>

    <section
      v-for="(list, index) in displayLists"
      :key="list.id"
      class="section"
      :class="{
        'is-dragging': draggedIndex === index,
        'drag-over': dragOverIndex === index && draggedIndex !== index,
        'list-todo-drop': dragOverListZone === list.id,
      }"
      :draggable="!isDraggingTodo()"
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

      <TransitionGroup
        name="fade"
        tag="div"
        class="items"
        :class="{ 'items--empty-drop': manualSort && !list.displayTodos.length }"
        @dragover="onListZoneDragOver(list.id, $event)"
        @dragleave="onListZoneDragLeave"
        @drop="onListZoneDrop(list.id, list.displayTodos.length, $event)"
      >
        <div
          v-for="(todo, ti) in list.displayTodos"
          :key="todo.id"
          :data-todo-id="list.id + '-' + todo.id"
          :draggable="manualSort"
          :class="{
            'todo-dragging': manualSort && draggedTodoListId === list.id && draggedTodoIndex === ti,
            'todo-drag-before': dragOverTodoKey === list.id + '-' + ti && dragOverHalf === 'before' && !(draggedTodoListId === list.id && draggedTodoIndex === ti),
            'todo-drag-after': dragOverTodoKey === list.id + '-' + ti && dragOverHalf === 'after' && !(draggedTodoListId === list.id && draggedTodoIndex === ti),
          }"
          @dragstart="onTodoDragStart(list.id, ti, $event)"
          @dragover="onTodoDragOver(list.id, ti, $event)"
          @dragleave="onTodoDragLeave($event)"
          @drop="onTodoDrop(list.id, ti, $event)"
          @dragend="onTodoDragEnd"
        >
          <TodoItem
            :todo="todo"
            :compact="shoppingMode && todo.done"
            :shopping-mode="shoppingMode"
            :reorderable="manualSort"
            :can-undo="canUndoTodo(todo.id)"
            :can-redo="canRedoTodo(todo.id)"
            @toggle="toggleTodo(list.id, todo.id)"
            @remove="removeTodo(list.id, todo.id)"
            @rename="(id, text) => renameTodo(list.id, id, text)"
            @set-quantity="(qty) => setQuantity(list.id, todo.id, qty)"
            @set-unit="(unit, factor, newQty) => setUnit(list.id, todo.id, unit, factor, newQty)"
            @undo="undoTodoAction(list.id, todo.id)"
            @redo="redoTodoAction(list.id, todo.id)"
          />
        </div>
      </TransitionGroup>

      <TodoInput :suggestions="allTodoTexts" @add="(text) => addTodo(list.id, text)" @navigate="scrollToTodo" />
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

.shopping-section {
  padding-bottom: 1rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
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

/* Liste vide : zone de drop avec hauteur, sinon le DnD n’a aucune cible */
.items--empty-drop {
  min-height: 1.375rem;
}

.fade-move {
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

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

@keyframes highlight-flash {
  0% { background: transparent; }
  15% { background: color-mix(in srgb, var(--accent) 18%, transparent); }
  100% { background: transparent; }
}

:deep(.highlight-flash) {
  animation: highlight-flash 2.4s ease-out;
  border-radius: 6px;
}

.todo-dragging {
  opacity: 0.3;
}

.todo-drag-before {
  box-shadow: 0 -2px 0 0 var(--accent);
  border-radius: 6px;
}

.todo-drag-after {
  box-shadow: 0 2px 0 0 var(--accent);
  border-radius: 6px;
}

.list-todo-drop {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

[draggable="true"] {
  cursor: grab;
}

[draggable="true"]:active {
  cursor: grabbing;
}
</style>
