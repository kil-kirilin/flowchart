<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface BlockType {
  id: number
  type_name: string
  icon_url: string
  default_text: string
}

interface CanvasNode {
  id: string
  typeId: number
  typeName: string
  text: string
  x: number
  y: number
  width: number
  height: number
  iconUrl: string
}

// ====== СОСТОЯНИЕ ======
const blockTypes = ref<BlockType[]>([])
const nodes = ref<CanvasNode[]>([])
const nextId = ref(1)
const selectedNodeId = ref<string | null>(null)
const editedText = ref('')
const diagramName = ref('Моя схема')
const savedDiagrams = ref<any[]>([])
const selectedDiagramId = ref<number | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)

const dragNode = ref<CanvasNode | null>(null)
const dragOffset = ref({ x: 0, y: 0 })

// ====== ФУНКЦИИ ДЛЯ ИЗОБРАЖЕНИЙ ======
const getImageUrl = (url: string) => {
  if (!url) return ''
  let cleanUrl = url
  while (cleanUrl.startsWith('/')) {
    cleanUrl = cleanUrl.slice(1)
  }
  return `/${cleanUrl}`
}

// ====== СОЗДАНИЕ БЛОКА ======
const createNode = (blockType: BlockType) => {
  const newNode: CanvasNode = {
    id: `node-${nextId.value++}`,
    typeId: blockType.id,
    typeName: blockType.type_name,
    text: blockType.default_text || blockType.type_name,
    x: 100 + Math.random() * 300,
    y: 100 + Math.random() * 200,
    width: 120,
    height: 60,
    iconUrl: blockType.icon_url
  }
  nodes.value.push(newNode)
  console.log('✅ Создан блок:', newNode)
}

// ====== ВЫБОР БЛОКА ======
const selectNode = (node: CanvasNode) => {
  selectedNodeId.value = node.id
  editedText.value = node.text
}

const updateNodeText = () => {
  const node = nodes.value.find(n => n.id === selectedNodeId.value)
  if (node) {
    node.text = editedText.value
  }
}

// ====== УДАЛЕНИЕ БЛОКА ======
const deleteNode = (nodeId: string) => {
  if (!confirm('Удалить этот блок?')) return
  nodes.value = nodes.value.filter(n => n.id !== nodeId)
  if (selectedNodeId.value === nodeId) {
    selectedNodeId.value = null
    editedText.value = ''
  }
}

const clearCanvas = () => {
  if (nodes.value.length === 0) return
  if (!confirm('Удалить все блоки?')) return
  nodes.value = []
  selectedNodeId.value = null
  editedText.value = ''
}

// ====== КЛАВИША DELETE ======
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId.value) {
    if (e.target instanceof HTMLInputElement) return
    e.preventDefault()
    deleteNode(selectedNodeId.value)
  }
}

// ====== DRAG AND DROP ======
const startDrag = (e: MouseEvent, node: CanvasNode) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dragNode.value = node
  dragOffset.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

const onDrag = (e: MouseEvent) => {
  if (!dragNode.value) return
  const canvas = document.querySelector('.canvas') as HTMLElement
  const rect = canvas.getBoundingClientRect()
  dragNode.value.x = e.clientX - rect.left - dragOffset.value.x
  dragNode.value.y = e.clientY - rect.top - dragOffset.value.y
}

const stopDrag = () => {
  dragNode.value = null
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// ====== СПИСОК СХЕМ ======
const loadSavedDiagrams = async () => {
  console.log('📋 Загрузка списка схем...')
  isLoading.value = true
  loadError.value = null
  
  try {
    const response = await fetch('http://localhost:3000/api/diagrams/list')
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    savedDiagrams.value = await response.json()
    console.log('📋 Получен список схем:', savedDiagrams.value)
    
    if (savedDiagrams.value.length === 0) {
      console.log('📭 Нет сохраненных схем')
    }
  } catch (err) {
    console.error('❌ Ошибка загрузки списка:', err)
    loadError.value = err instanceof Error ? err.message : 'Неизвестная ошибка'
  } finally {
    isLoading.value = false
  }
}

// ====== ВЫБОР СХЕМЫ ИЗ СПИСКА ======
const selectDiagram = (id: number) => {
  console.log('🖱️ Выбрана схема ID:', id)
  selectedDiagramId.value = id
  // Автоматически загружаем схему при клике
  loadSelectedDiagram()
}

// ====== ЗАГРУЗКА СХЕМЫ ПО ID ======
const loadSelectedDiagram = async () => {
  if (!selectedDiagramId.value) {
    alert('Выберите схему из списка')
    return
  }
  
  console.log('📥 Загрузка схемы ID:', selectedDiagramId.value)
  isLoading.value = true
  loadError.value = null
  
  try {
    const response = await fetch(`http://localhost:3000/api/diagrams/${selectedDiagramId.value}`)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('📥 Получены данные:', data)
    
    if (!data.nodes || data.nodes.length === 0) {
      alert('В этой схеме нет блоков')
      return
    }
    
    // Очищаем текущие блоки
    nodes.value = []
    
    // Загружаем новые блоки
    nodes.value = data.nodes.map((n: any) => ({
      id: `node-${n.id}`,
      typeId: n.block_type_id,
      typeName: n.type_name,
      text: n.text_content || n.type_name || 'Блок',
      x: n.position_x,
      y: n.position_y,
      width: n.width || 120,
      height: n.height || 60,
      iconUrl: n.icon_url || '/blocks/start.png'
    }))
    
    // Обновляем счетчик ID
    const maxId = nodes.value.reduce((max, n) => {
      const num = parseInt(n.id.split('-')[1])
      return num > max ? num : max
    }, 0)
    nextId.value = maxId + 1
    
    // Обновляем название
    const diagram = savedDiagrams.value.find(d => d.id === selectedDiagramId.value)
    diagramName.value = diagram?.name || 'Загруженная схема'
    
    console.log('✅ Загружено узлов:', nodes.value.length)
    alert(`Схема "${diagramName.value}" загружена! (${nodes.value.length} блоков)`)
    
  } catch (err) {
    console.error('❌ Ошибка загрузки:', err)
    loadError.value = err instanceof Error ? err.message : 'Неизвестная ошибка'
    alert('Ошибка загрузки: ' + (err instanceof Error ? err.message : 'Неизвестная ошибка'))
  } finally {
    isLoading.value = false
  }
}

// ====== СОХРАНЕНИЕ ======
const saveDiagramWithName = async () => {
  console.log('💾 Сохранение схемы...')
  
  if (nodes.value.length === 0) {
    alert('Нет блоков для сохранения')
    return
  }
  
  const name = prompt('Введите название схемы:', diagramName.value || 'Моя схема')
  if (name === null) return
  
  try {
    const response = await fetch('http://localhost:3000/api/diagrams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        projectId: 1,
        nodes: nodes.value
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    diagramName.value = name
    alert(`✅ Схема "${name}" сохранена! ID: ${data.id}`)
    
    // Обновляем список схем
    await loadSavedDiagrams()
    
  } catch (err) {
    console.error('❌ Ошибка сохранения:', err)
    alert('Ошибка сохранения: ' + (err instanceof Error ? err.message : 'Неизвестная ошибка'))
  }
}

// ====== УДАЛЕНИЕ СХЕМЫ ======
const deleteDiagram = async (id: number) => {
  if (!confirm('Удалить эту схему?')) return
  
  try {
    const response = await fetch(`http://localhost:3000/api/diagrams/${id}`, {
      method: 'DELETE'
    })
    
    if (response.ok) {
      alert('Схема удалена')
      await loadSavedDiagrams()
      if (selectedDiagramId.value === id) {
        selectedDiagramId.value = null
      }
    }
  } catch (err) {
    console.error('Ошибка удаления:', err)
    alert('Ошибка удаления')
  }
}

// ====== ЗАГРУЗКА ПРИ СТАРТЕ ======
onMounted(async () => {
  console.log('🚀 Приложение запущено')
  
  try {
    const response = await fetch('http://localhost:3000/block-types')
    if (response.ok) {
      blockTypes.value = await response.json()
      console.log('✅ Загружены типы блоков:', blockTypes.value)
    } else {
      console.error('❌ Ошибка загрузки типов блоков:', response.status)
    }
  } catch (err) {
    console.error('❌ Ошибка:', err)
  }
  
  document.addEventListener('keydown', handleKeyDown)
  
  // Загружаем список схем
  await loadSavedDiagrams()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <h2>FLOWCHART</h2>
      
      <!-- Управление -->
      <div class="controls">
        <div class="button-group">
          <button @click="saveDiagramWithName" class="btn save">💾 Сохранить</button>
          <button @click="loadSavedDiagrams" class="btn load">🔄 Обновить список</button>
          <button @click="clearCanvas" class="btn clear">🗑️ Очистить</button>
        </div>
      </div>
      
      <!-- Список схем -->
      <div class="diagram-section">
        <h4>Сохраненные схемы:</h4>
        
        <div v-if="isLoading" class="loading-text">
          Загрузка...
        </div>
        
        <div v-else-if="loadError" class="error-text">
          Ошибка: {{ loadError }}
        </div>
        
        <div v-else-if="savedDiagrams.length === 0" class="empty-text">
          Нет сохраненных схем
        </div>
        
        <div v-else class="diagram-list">
          <div 
            v-for="diagram in savedDiagrams" 
            :key="diagram.id"
            class="diagram-item"
            :class="{ active: selectedDiagramId === diagram.id }"
            @click="selectDiagram(diagram.id)"
          >
            <div class="diagram-info-left">
              <span class="diagram-name">{{ diagram.name }}</span>
              <span class="diagram-date">{{ new Date(diagram.created_at).toLocaleDateString() }}</span>
            </div>
            <div class="diagram-info-right">
              <span class="diagram-count">📦 {{ diagram.nodes_count || 0 }}</span>
              <button @click.stop="deleteDiagram(diagram.id)" class="btn-small delete-btn" title="Удалить">🗑️</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Подсказка -->
      <div v-if="selectedNodeId" class="delete-hint">
        Нажмите <kbd>Delete</kbd> для удаления блока
      </div>
      
      <!-- Панель инструментов -->
      <div class="toolbar">
        <div
          v-for="block in blockTypes"
          :key="block.id"
          class="tool-item"
          @click="createNode(block)"
        >
          <img :src="getImageUrl(block.icon_url)" class="tool-icon" />
          <span>{{ block.default_text }}</span>
        </div>
      </div>
      
      <!-- Панель свойств -->
      <div v-if="selectedNodeId" class="properties">
        <h3>Свойства</h3>
        <input
          v-model="editedText"
          @input="updateNodeText"
          class="property-input"
          placeholder="Текст блока"
        />
        <div class="property-actions">
          <button @click="deleteNode(selectedNodeId)" class="btn delete-btn">
            🗑️ Удалить блок
          </button>
          <button @click="selectedNodeId = null" class="close-btn">✕</button>
        </div>
      </div>
    </aside>
    
    <!-- Canvas -->
    <main class="canvas">
      <div
        v-for="node in nodes"
        :key="node.id"
        class="canvas-node"
        :class="{ selected: selectedNodeId === node.id }"
        :style="{
          left: node.x + 'px',
          top: node.y + 'px',
          width: node.width + 'px',
          height: node.height + 'px'
        }"
        @mousedown="startDrag($event, node)"
        @click="selectNode(node)"
      >
        <img :src="getImageUrl(node.iconUrl)" class="node-icon" />
        <span>{{ node.text }}</span>
      </div>
      
      <svg class="svg-layer">
        <line x1="220" y1="120" x2="500" y2="120" stroke="#4CAF50" stroke-width="2" />
      </svg>
    </main>
  </div>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.app {
  display: flex;
  width: 100vw;
  height: 100vh;
  background: #1e1e1e;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: #252526;
  border-right: 1px solid #333;
  color: white;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar h2 {
  font-size: 32px;
  color: #4CAF50;
  letter-spacing: 2px;
  margin-bottom: 15px;
}

.controls {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.button-group {
  display: flex;
  gap: 6px;
}

.button-group .btn {
  flex: 1;
  padding: 8px;
  font-size: 13px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.save {
  background: #4CAF50;
  color: white;
}
.save:hover { background: #45a049; }

.load {
  background: #2196F3;
  color: white;
}
.load:hover { background: #1976D2; }

.clear {
  background: #ff6b6b;
  color: white;
}
.clear:hover { background: #e55a5a; }

.diagram-section {
  margin-bottom: 8px;
  flex-shrink: 0;
}

.diagram-section h4 {
  color: #888;
  font-size: 11px;
  margin-bottom: 5px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.loading-text, .empty-text, .error-text {
  color: #888;
  font-size: 12px;
  padding: 8px;
  text-align: center;
}

.error-text {
  color: #ff6b6b;
}

.diagram-list {
  max-height: 120px;
  overflow-y: auto;
}

.diagram-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  margin-bottom: 3px;
  background: #1e1e1e;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.diagram-item:hover {
  border-color: #4CAF50;
  background: #2d2d30;
}

.diagram-item.active {
  border-color: #FFD700;
  background: #2d2d30;
}

.diagram-info-left {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.diagram-name {
  color: white;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagram-date {
  color: #666;
  font-size: 9px;
}

.diagram-info-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.diagram-count {
  color: #888;
  font-size: 10px;
  white-space: nowrap;
}

.btn-small {
  padding: 2px 5px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  background: transparent;
  color: #666;
  transition: all 0.2s;
}

.btn-small:hover {
  transform: scale(1.2);
  color: #ff6b6b;
}

.diagram-list::-webkit-scrollbar {
  width: 4px;
}
.diagram-list::-webkit-scrollbar-track { background: #1e1e1e; }
.diagram-list::-webkit-scrollbar-thumb { background: #4CAF50; border-radius: 2px; }

.delete-hint {
  color: #888;
  font-size: 12px;
  text-align: center;
  margin-top: 4px;
  flex-shrink: 0;
}

.delete-hint kbd {
  background: #1e1e1e;
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid #444;
  color: #fff;
  font-size: 11px;
}

.toolbar {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 10px;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  margin-bottom: 8px;
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  color: #cccccc;
}

.tool-item:hover {
  background: #3e3e42;
  border-color: #4CAF50;
  transform: translateX(4px);
}

.tool-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.tool-item span {
  font-size: 14px;
  font-weight: 500;
}

.properties {
  padding: 15px;
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  flex-shrink: 0;
}

.properties h3 {
  font-size: 14px;
  margin-bottom: 10px;
}

.property-input {
  width: 100%;
  padding: 8px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: white;
  font-size: 14px;
}

.property-input:focus {
  outline: none;
  border-color: #4CAF50;
}

.property-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.delete-btn {
  background: #ff6b6b;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  flex: 1;
}
.delete-btn:hover { background: #e55a5a; }

.close-btn {
  margin-top: 0;
  padding: 6px 12px;
  background: #555;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 14px;
}
.close-btn:hover { background: #666; }

.canvas {
  position: relative;
  flex: 1;
  background: #1e1e1e;
}

.canvas-node {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #2d2d30;
  border: 2px solid #4CAF50;
  border-radius: 8px;
  color: white;
  cursor: move;
  user-select: none;
  padding: 8px;
  transition: box-shadow 0.2s;
}

.canvas-node:hover {
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

.canvas-node.selected {
  border-color: #FFD700;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
}

.node-icon {
  width: 30px;
  height: 30px;
  object-fit: contain;
  margin-bottom: 4px;
}

.canvas-node span {
  font-size: 12px;
  text-align: center;
}

.svg-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.toolbar::-webkit-scrollbar {
  width: 6px;
}
.toolbar::-webkit-scrollbar-track { background: #252526; }
.toolbar::-webkit-scrollbar-thumb { background: #4CAF50; border-radius: 3px; }
</style>