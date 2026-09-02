<script setup>
import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onBeforeUnmount,
} from 'vue'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import TodoItem from './TodoItem.vue'
import QuickAddTodo from './QuickAddTodo.vue'
import IconTrash from '@/components/ui/icons/IconTrash.vue'
import { useTodoStorage } from '@/composables/useTodoStorage'
import { useSelectedList } from '@/composables/useSelectedList'
import {
  buildVirtualRows,
  estimateRowSize,
  findTodoRowIndex,
  findListHeaderRowIndex,
} from '@/utils/todo/virtualRows.js'

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

const listParentRef = ref(null)
const parentOffsetRef = ref(0)

const virtualRows = computed(() =>
  buildVirtualRows({
    shoppingMode: shoppingMode.value,
    shoppingTodos: shoppingTodos.value,
    displayLists: displayLists.value,
    manualSort: manualSort.value,
  }),
)

const { selectedListId, selectList, ensureValidSelection } = useSelectedList()

watch(
  lists,
  (value) => ensureValidSelection(value),
  { deep: true, immediate: true },
)

const updateParentOffset = () => {
  parentOffsetRef.value = listParentRef.value?.offsetTop ?? 0
}

const virtualizerOptions = computed(() => ({
  count: virtualRows.value.length,
  estimateSize: (index) => estimateRowSize(virtualRows.value[index] ?? { type: 'todo' }),
  overscan: 6,
  scrollMargin: parentOffsetRef.value,
  scrollPaddingStart: 72,
  getItemKey: (index) => virtualRows.value[index]?.key ?? index,
}))

const virtualizer = useWindowVirtualizer(virtualizerOptions)

const totalSize = computed(() => virtualizer.value.getTotalSize())

/** Lignes montées, avec leur décalage déjà résolu : une seule expression par ligne. */
const visibleRows = computed(() => {
  const rows = virtualRows.value
  const margin = virtualizer.value.options.scrollMargin ?? 0
  return virtualizer.value
    .getVirtualItems()
    .map((item) => ({
      key: item.key,
      index: item.index,
      offset: item.start - margin,
      row: rows[item.index],
    }))
    .filter((item) => item.row)
})

// Vue rappelle les refs fonction à chaque patch : sans ce filtre, chaque frame de
// scroll relancerait une mesure (donc un reflow) par ligne visible. TanStack
// observe l'élément dès la première mesure, les hauteurs dynamiques suivent.
let measuredIndexes = new WeakMap()

const measureRow = (el) => {
  if (!el) return
  const index = Number(el.dataset.index)
  if (measuredIndexes.get(el) === index) return
  measuredIndexes.set(el, index)
  virtualizer.value.measureElement(el)
}

// Handlers stables par tâche : des fonctions recréées à chaque render feraient
// re-rendre tous les TodoItem montés à chaque frame de scroll.
const todoActionCache = new Map()

const todoActions = (listId, todoId) => {
  const key = `${listId}:${todoId}`
  let actions = todoActionCache.get(key)
  if (!actions) {
    actions = {
      onToggle: () => toggleTodo(listId, todoId),
      onRemove: () => removeTodo(listId, todoId),
      onRename: (id, text) => renameTodo(listId, id, text),
      onSetQuantity: (qty) => setQuantity(listId, todoId, qty),
      onSetUnit: (unit, factor, newQty) => setUnit(listId, todoId, unit, factor, newQty),
      onUndo: () => undoTodoAction(listId, todoId),
      onRedo: () => redoTodoAction(listId, todoId),
    }
    todoActionCache.set(key, actions)
  }
  return actions
}

const goToList = (listId) => {
  const index = findListHeaderRowIndex(virtualRows.value, listId)
  if (index < 0) return
  virtualizer.value.scrollToIndex(index, { align: 'start', behavior: 'smooth' })
}

watch(
  [virtualRows, totalSize],
  async () => {
    await nextTick()
    updateParentOffset()
    if (todoActionCache.size > 800) todoActionCache.clear()
  },
  { flush: 'post' },
)

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
const listDragArmedIndex = ref(null)

const armListDrag = (index, e) => {
  if (isDraggingTodo()) return
  listDragArmedIndex.value = index
  e.currentTarget.closest('.section-header-row')?.setAttribute('draggable', 'true')
}

const disarmListDrag = () => {
  document.querySelectorAll('.section-header-row[draggable="true"]').forEach((el) => {
    el.draggable = false
  })
  listDragArmedIndex.value = null
}

const onHandlePointerUp = () => {
  if (draggedIndex.value === null) disarmListDrag()
}

const onDragStart = (index, e) => {
  if (listDragArmedIndex.value !== index) {
    e.preventDefault()
    return
  }
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
  disarmListDrag()
}

const onDragEnd = () => {
  draggedIndex.value = null
  dragOverIndex.value = null
  disarmListDrag()
}

const scrollToTodo = async (listId, todoId) => {
  const index = findTodoRowIndex(virtualRows.value, listId, todoId)
  if (index < 0) return
  virtualizer.value.scrollToIndex(index, { align: 'center', behavior: 'smooth' })

  const key = `${listId}-${todoId}`
  const tryFlash = (attempts = 30) => {
    const el = document.querySelector(`[data-todo-id="${key}"]`)
    if (el) {
      el.classList.add('highlight-flash')
      setTimeout(() => el.classList.remove('highlight-flash'), 5000)
      return
    }
    if (attempts > 0) requestAnimationFrame(() => tryFlash(attempts - 1))
  }
  await nextTick()
  tryFlash()
}

watch(showNewList, async () => {
  await nextTick()
  virtualizer.value.measure()
  invalidateLayout()
})

const draggedTodoListId = ref(null)
const draggedTodoIndex = ref(null)
const dragOverTodoKey = ref(null)
const dragOverHalf = ref(null)
const dragOverListZone = ref(null)
const todoDragArmedKey = ref(null)
const shoppingDragArmedIndex = ref(null)

const isDraggingTodo = () => draggedTodoListId.value !== null

const armTodoDrag = (listId, index, e) => {
  if (!manualSort.value) return
  if (!e.target.closest?.('.drag-grip')) return
  todoDragArmedKey.value = `${listId}-${index}`
  e.currentTarget.setAttribute('draggable', 'true')
}

const disarmTodoDragAttr = () => {
  document.querySelectorAll('.todo-row[draggable="true"]').forEach((el) => {
    el.draggable = false
  })
  todoDragArmedKey.value = null
  shoppingDragArmedIndex.value = null
}

const onTodoPointerUp = () => {
  if (draggedTodoListId.value === null && draggedShoppingIndex.value === null) {
    disarmTodoDragAttr()
  }
}

const onTodoDragStart = (listId, index, e) => {
  if (!manualSort.value) return
  if (todoDragArmedKey.value !== `${listId}-${index}`) {
    e.preventDefault()
    return
  }
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
  const half = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
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
  disarmTodoDragAttr()
}

const onTodoDragEnd = () => {
  resetTodoDrag()
}

const draggedShoppingIndex = ref(null)
const dragOverShoppingKey = ref(null)
const dragOverShoppingHalf = ref(null)

const armShoppingDrag = (index, e) => {
  if (!shoppingManualSort.value) return
  if (!e.target.closest?.('.drag-grip')) return
  shoppingDragArmedIndex.value = index
  e.currentTarget.setAttribute('draggable', 'true')
}

const onShoppingDragStart = (index, e) => {
  if (!shoppingManualSort.value) return
  if (shoppingDragArmedIndex.value !== index) {
    e.preventDefault()
    return
  }
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
  dragOverShoppingHalf.value = e.clientY - rect.top < rect.height / 2 ? 'before' : 'after'
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
  shoppingDragArmedIndex.value = null
  disarmTodoDragAttr()
}

const onShoppingDragEnd = () => {
  resetShoppingDrag()
}

const onResize = () => {
  updateParentOffset()
  // measure() repart des estimations : les lignes montées doivent être remesurées.
  measuredIndexes = new WeakMap()
  virtualizer.value.measure()
}

onMounted(() => {
  updateParentOffset()
  window.addEventListener('resize', onResize, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="lists">
    <QuickAddTodo
      :lists="lists"
      :suggestions="allTodoTexts"
      @add="(listId, text) => addTodo(listId, text)"
      @navigate="scrollToTodo"
      @toggle="(listId, todoId) => toggleTodo(listId, todoId)"
      @go-to-list="goToList"
    />

    <div
      ref="listParentRef"
      class="virtual-list"
      :style="{ height: `${totalSize}px` }"
    >
      <div
        v-for="item in visibleRows"
        :key="item.key"
        :ref="measureRow"
        class="v-row"
        :data-index="item.index"
        :data-row-type="item.row.type"
        :style="{ transform: `translateY(${item.offset}px)` }"
      >
        <div
          v-if="item.row.type === 'shopping-todo'"
          class="todo-row"
          :data-todo-id="item.row.listId + '-' + item.row.todo.id"
          :draggable="shoppingDragArmedIndex === item.row.shoppingIndex"
          :class="{
            'todo-dragging':
              shoppingManualSort && draggedShoppingIndex === item.row.shoppingIndex,
            'todo-drag-before':
              shoppingManualSort &&
              dragOverShoppingKey === item.row.shoppingIndex &&
              dragOverShoppingHalf === 'before' &&
              draggedShoppingIndex !== item.row.shoppingIndex,
            'todo-drag-after':
              shoppingManualSort &&
              dragOverShoppingKey === item.row.shoppingIndex &&
              dragOverShoppingHalf === 'after' &&
              draggedShoppingIndex !== item.row.shoppingIndex,
          }"
          @pointerdown="armShoppingDrag(item.row.shoppingIndex, $event)"
          @pointerup="onTodoPointerUp"
          @pointercancel="onTodoPointerUp"
          @dragstart="onShoppingDragStart(item.row.shoppingIndex, $event)"
          @dragover="onShoppingDragOver(item.row.shoppingIndex, $event)"
          @dragleave="onShoppingDragLeave($event)"
          @drop="onShoppingDrop(item.row.shoppingIndex, $event)"
          @dragend="onShoppingDragEnd"
        >
          <TodoItem
            :todo="item.row.todo"
            :shopping-mode="true"
            :reorderable="shoppingManualSort"
            :can-undo="canUndoTodo(item.row.todo.id)"
            :can-redo="canRedoTodo(item.row.todo.id)"
            v-bind="todoActions(item.row.listId, item.row.todo.id)"
          />
        </div>

        <div v-else-if="item.row.type === 'shopping-end'" class="shopping-end" />

        <div
          v-else-if="item.row.type === 'list-header'"
          class="section-header-row"
          :data-list-id="item.row.listId"
          :class="{
            'is-first': item.row.isFirstList,
            'is-target': selectedListId === item.row.listId,
            'is-dragging': draggedIndex === item.row.listIndex,
            'drag-over':
              dragOverIndex === item.row.listIndex && draggedIndex !== item.row.listIndex,
            'list-todo-drop': dragOverListZone === item.row.listId,
          }"
          :draggable="listDragArmedIndex === item.row.listIndex"
          @click="selectList(item.row.listId)"
          @dragstart="onDragStart(item.row.listIndex, $event)"
          @dragover="onDragOver(item.row.listIndex, $event)"
          @dragleave="onDragLeave"
          @drop="onDrop(item.row.listIndex)"
          @dragend="onDragEnd"
        >
          <div class="section-header">
            <span
              class="drag-handle"
              aria-label="Glisser pour réordonner"
              @pointerdown="armListDrag(item.row.listIndex, $event)"
              @pointerup="onHandlePointerUp"
              @pointercancel="onHandlePointerUp"
            >⠿</span>
            <input
              v-if="editingListId === item.row.listId"
              ref="editInputRef"
              v-model="editingName"
              type="text"
              class="title-input"
              @blur="saveEditList"
              @keydown.enter="saveEditList"
              @keydown.escape="cancelEditList"
            />
            <h2 v-else class="title" @dblclick="startEditList(item.row.list)">
              {{ item.row.list.name }}
            </h2>
            <button
              v-if="editingListId === item.row.listId && displayLists.length > 1"
              class="delete-list"
              aria-label="Supprimer la liste"
              @click.stop
              @mousedown.prevent.stop="removeList(item.row.listId)"
            >
              <IconTrash />
            </button>
          </div>
        </div>

        <div
          v-else-if="item.row.type === 'list-empty'"
          class="items--empty-drop"
          :class="{ 'list-todo-drop': dragOverListZone === item.row.listId }"
          @dragover="onListZoneDragOver(item.row.listId, $event)"
          @dragleave="onListZoneDragLeave"
          @drop="onListZoneDrop(item.row.listId, item.row.todoCount, $event)"
        />

        <div
          v-else-if="item.row.type === 'todo'"
          class="todo-row"
          :data-todo-id="item.row.listId + '-' + item.row.todo.id"
          :draggable="todoDragArmedKey === item.row.listId + '-' + item.row.todoIndex"
          :class="{
            'todo-dragging':
              manualSort &&
              draggedTodoListId === item.row.listId &&
              draggedTodoIndex === item.row.todoIndex,
            'todo-drag-before':
              dragOverTodoKey === item.row.listId + '-' + item.row.todoIndex &&
              dragOverHalf === 'before' &&
              !(
                draggedTodoListId === item.row.listId &&
                draggedTodoIndex === item.row.todoIndex
              ),
            'todo-drag-after':
              dragOverTodoKey === item.row.listId + '-' + item.row.todoIndex &&
              dragOverHalf === 'after' &&
              !(
                draggedTodoListId === item.row.listId &&
                draggedTodoIndex === item.row.todoIndex
              ),
          }"
          @pointerdown="armTodoDrag(item.row.listId, item.row.todoIndex, $event)"
          @pointerup="onTodoPointerUp"
          @pointercancel="onTodoPointerUp"
          @dragstart="onTodoDragStart(item.row.listId, item.row.todoIndex, $event)"
          @dragover="onTodoDragOver(item.row.listId, item.row.todoIndex, $event)"
          @dragleave="onTodoDragLeave($event)"
          @drop="onTodoDrop(item.row.listId, item.row.todoIndex, $event)"
          @dragend="onTodoDragEnd"
        >
          <TodoItem
            :todo="item.row.todo"
            :compact="item.row.compact"
            :shopping-mode="shoppingMode"
            :reorderable="manualSort"
            :can-undo="canUndoTodo(item.row.todo.id)"
            :can-redo="canRedoTodo(item.row.todo.id)"
            v-bind="todoActions(item.row.listId, item.row.todo.id)"
          />
        </div>

        <div v-else-if="item.row.type === 'add-list'" class="add-section">
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
    </div>
  </div>
</template>

<style scoped>
.lists {
  touch-action: pan-y;
}

.virtual-list {
  position: relative;
  width: 100%;
}

.v-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  touch-action: pan-y;
}

.section-header-row {
  border-radius: 8px;
  padding: 0.5rem 0.5rem 0.25rem;
  margin: 0 -0.5rem;
  cursor: pointer;
  transition: opacity 0.25s, box-shadow 0.25s, background 0.25s;
}

.section-header-row:not(.is-first) {
  margin-top: 1.25rem;
}

.shopping-end {
  margin: 0.5rem 0 0.25rem;
  border-bottom: 1px solid var(--color-border);
  height: 1px;
}

.section-header-row.is-dragging {
  opacity: 0.4;
}

.section-header-row.drag-over {
  box-shadow: 0 -2px 0 0 var(--accent);
}

.section-header-row.is-target .title {
  color: var(--accent);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.drag-handle {
  cursor: grab;
  user-select: none;
  touch-action: none;
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

.items--empty-drop {
  min-height: 1.375rem;
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
  border-radius: 6px;
}

.add-section {
  padding-top: 1.25rem;
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
  touch-action: pan-y;
}

[draggable="true"]:active {
  cursor: grabbing;
}
</style>
