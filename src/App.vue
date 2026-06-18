<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

// ====== ИНТЕРФЕЙСЫ ======
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

interface Connection {
  id: string
  sourceId: string
  targetId: string
}

// ====== СОСТОЯНИЕ ======
const blockTypes = ref<BlockType[]>([])
const nodes = ref<CanvasNode[]>([])
const connections = ref<Connection[]>([])
const nextId = ref(1)
const selectedNodeId = ref<string | null>(null)
const selectedConnectionId = ref<string | null>(null)
const editedText = ref('')
const diagramName = ref('Моя схема')
const savedDiagrams = ref<any[]>([])
const selectedDiagramId = ref<number | null>(null)
const isLoading = ref(false)
const loadError = ref<string | null>(null)

// Состояние для создания связей
const isConnecting = ref(false)
const connectionStartNode = ref<string | null>(null)
const connectionEndX = ref(0)
const connectionEndY = ref(0)

// Drag state
const dragNode = ref<CanvasNode | null>(null)
const dragOffset = ref({ x: 0, y: 0 })

// ====== ВЫЧИСЛЕНИЯ ДЛЯ КРИВЫХ ======
const getNodeCenter = (nodeId: string) => {
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return { x: 0, y: 0 }
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2
  }
}

const getConnectionPath = (connection: Connection) => {
  const source = getNodeCenter(connection.sourceId)
  const target = getNodeCenter(connection.targetId)
  
  const dx = Math.abs(target.x - source.x)
  const dy = Math.abs(target.y - source.y)
  const offset = Math.max(dx, dy) * 0.4
  
  const cp1x = source.x + (target.x - source.x) * 0.3
  const cp1y = source.y + (target.y - source.y) * 0.3 - offset * 0.3
  const cp2x = source.x + (target.x - source.x) * 0.7
  const cp2y = source.y + (target.y - source.y) * 0.7 + offset * 0.3
  
  return `M ${source.x} ${source.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${target.x} ${target.y}`
}

const getTempPath = () => {
  if (!connectionStartNode.value) return ''
  const source = getNodeCenter(connectionStartNode.value)
  const targetX = connectionEndX.value
  const targetY = connectionEndY.value
  
  const dx = Math.abs(targetX - source.x)
  const dy = Math.abs(targetY - source.y)
  const offset = Math.max(dx, dy) * 0.3
  
  const cp1x = source.x + (targetX - source.x) * 0.3
  const cp1y = source.y + (targetY - source.y) * 0.3 - offset * 0.3
  const cp2x = source.x + (targetX - source.x) * 0.7
  const cp2y = source.y + (targetY - source.y) * 0.7 + offset * 0.3
  
  return `M ${source.x} ${source.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`
}

// ====== ФУНКЦИИ ======
const getImageUrl = (url: string) => {
  if (!url) return ''
  let cleanUrl = url
  while (cleanUrl.startsWith('/')) {
    cleanUrl = cleanUrl.slice(1)
  }
  return `/${cleanUrl}`
}

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

const selectNode = (node: CanvasNode) => {
  if (isConnecting.value) return
  selectedNodeId.value = node.id
  selectedConnectionId.value = null
  editedText.value = node.text
}

const updateNodeText = () => {
  const node = nodes.value.find(n => n.id === selectedNodeId.value)
  if (node) {
    node.text = editedText.value
  }
}

const deleteNode = (nodeId: string) => {
  if (!confirm('Удалить этот блок?')) return
  connections.value = connections.value.filter(
    c => c.sourceId !== nodeId && c.targetId !== nodeId
  )
  nodes.value = nodes.value.filter(n => n.id !== nodeId)
  if (selectedNodeId.value === nodeId) {
    selectedNodeId.value = null
    editedText.value = ''
  }
}

const clearCanvas = () => {
  if (nodes.value.length === 0 && connections.value.length === 0) return
  if (!confirm('Удалить все блоки и связи?')) return
  nodes.value = []
  connections.value = []
  selectedNodeId.value = null
  selectedConnectionId.value = null
  editedText.value = ''
  isConnecting.value = false
  connectionStartNode.value = null
}

// ====== СОЗДАНИЕ СВЯЗЕЙ ======
const startConnection = (e: MouseEvent, nodeId: string) => {
  e.stopPropagation()
  if (isConnecting.value) return
  isConnecting.value = true
  connectionStartNode.value = nodeId
  const canvas = document.querySelector('.canvas') as HTMLElement
  const rect = canvas.getBoundingClientRect()
  connectionEndX.value = e.clientX - rect.left
  connectionEndY.value = e.clientY - rect.top
}

const updateConnection = (e: MouseEvent) => {
  if (!isConnecting.value || !connectionStartNode.value) return
  const canvas = document.querySelector('.canvas') as HTMLElement
  const rect = canvas.getBoundingClientRect()
  connectionEndX.value = e.clientX - rect.left
  connectionEndY.value = e.clientY - rect.top
}

const finishConnection = (e: MouseEvent) => {
  if (!isConnecting.value || !connectionStartNode.value) {
    isConnecting.value = false
    connectionStartNode.value = null
    return
  }
  
  const canvas = document.querySelector('.canvas') as HTMLElement
  const rect = canvas.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  
  let targetNodeId: string | null = null
  for (const node of nodes.value) {
    if (node.id === connectionStartNode.value) continue
    const nodeCenterX = node.x + node.width / 2
    const nodeCenterY = node.y + node.height / 2
    const distance = Math.sqrt(
      Math.pow(mouseX - nodeCenterX, 2) + 
      Math.pow(mouseY - nodeCenterY, 2)
    )
    if (distance < 60) {
      targetNodeId = node.id
      break
    }
  }
  
  if (targetNodeId) {
    const existing = connections.value.find(
      c => c.sourceId === connectionStartNode.value && c.targetId === targetNodeId
    )
    if (!existing) {
      const newConnection: Connection = {
        id: `conn-${Date.now()}`,
        sourceId: connectionStartNode.value,
        targetId: targetNodeId
      }
      connections.value.push(newConnection)
      console.log('🔗 Создана связь:', newConnection)
    }
  }
  
  isConnecting.value = false
  connectionStartNode.value = null
}

const cancelConnection = () => {
  isConnecting.value = false
  connectionStartNode.value = null
}

const deleteConnection = (connectionId: string) => {
  if (!confirm('Удалить эту связь?')) return
  connections.value = connections.value.filter(c => c.id !== connectionId)
  if (selectedConnectionId.value === connectionId) {
    selectedConnectionId.value = null
  }
}

const clearConnections = () => {
  if (connections.value.length === 0) return
  if (!confirm('Удалить все связи?')) return
  connections.value = []
  selectedConnectionId.value = null
}

// ====== КЛАВИШИ ======
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement) return
  if ((e.key === 'Delete' || e.key === 'Backspace')) {
    if (selectedConnectionId.value) {
      e.preventDefault()
      deleteConnection(selectedConnectionId.value)
    } else if (selectedNodeId.value) {
      e.preventDefault()
      deleteNode(selectedNodeId.value)
    }
  }
  if (e.key === 'Escape' && isConnecting.value) {
    cancelConnection()
  }
}

// ====== DRAG ======
const startDrag = (e: MouseEvent, node: CanvasNode) => {
  if (isConnecting.value) return
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

// ====== СОХРАНЕНИЕ И ЗАГРУЗКА ======
const loadSavedDiagrams = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/diagrams/list')
    if (response.ok) {
      savedDiagrams.value = await response.json()
    }
  } catch (err) {
    console.error('Ошибка загрузки списка:', err)
  }
}

const selectDiagram = (id: number) => {
  selectedDiagramId.value = id
  loadSelectedDiagram()
}

const loadSelectedDiagram = async () => {
  if (!selectedDiagramId.value) {
    alert('Выберите схему из списка')
    return
  }
  
  try {
    const response = await fetch(`http://localhost:3000/api/diagrams/${selectedDiagramId.value}`)
    if (!response.ok) {
      throw new Error('Схема не найдена')
    }
    
    const data = await response.json()
    if (!data.nodes || data.nodes.length === 0) {
      alert('В этой схеме нет блоков')
      return
    }
    
    nodes.value = []
    connections.value = []
    
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
    
    if (data.connections && data.connections.length > 0) {
      connections.value = data.connections.map((c: any) => ({
        id: `conn-${c.id}`,
        sourceId: `node-${c.source_node_id}`,
        targetId: `node-${c.target_node_id}`
      }))
    }
    
    const maxId = nodes.value.reduce((max, n) => {
      const num = parseInt(n.id.split('-')[1])
      return num > max ? num : max
    }, 0)
    nextId.value = maxId + 1
    
    const diagram = savedDiagrams.value.find(d => d.id === selectedDiagramId.value)
    diagramName.value = diagram?.name || 'Загруженная схема'
    
    alert(`Схема загружена! (${nodes.value.length} блоков, ${connections.value.length} связей)`)
    
  } catch (err) {
    console.error('Ошибка загрузки:', err)
    alert('Ошибка загрузки')
  }
}

const saveDiagramWithName = async () => {
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
        nodes: nodes.value,
        connections: connections.value
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    diagramName.value = name
    alert(`✅ Схема "${name}" сохранена! ID: ${data.id}`)
    await loadSavedDiagrams()
    
  } catch (err) {
    console.error('Ошибка сохранения:', err)
    alert('Ошибка сохранения')
  }
}

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

// ====== MOUNTED ======
onMounted(async () => {
  try {
    const response = await fetch('http://localhost:3000/block-types')
    if (response.ok) {
      blockTypes.value = await response.json()
    }
  } catch (err) {
    console.error('Ошибка:', err)
  }
  document.addEventListener('keydown', handleKeyDown)
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
      
      <div class="controls">
        <div class="button-group">
          <button @click="saveDiagramWithName" class="btn save">💾 Сохранить</button>
          <button @click="loadSavedDiagrams" class="btn load">🔄 Обновить</button>
          <button @click="clearCanvas" class="btn clear">🗑️ Очистить</button>
        </div>
        
        <div class="button-group">
          <button @click="clearConnections" class="btn clear-connections" :disabled="connections.length === 0">
            🧹 Удалить связи
          </button>
          <button v-if="isConnecting" @click="cancelConnection" class="btn cancel">
            ❌ Отмена
          </button>
        </div>
        
        <div v-if="isConnecting" class="connection-hint">
          🔗 Перетащите к нужному блоку для создания связи
        </div>
        
        <div class="counters">
          <span v-if="nodes.length > 0">📦 Блоков: {{ nodes.length }}</span>
          <span v-if="connections.length > 0">🔗 Связей: {{ connections.length }}</span>
        </div>
      </div>
      
      <div class="diagram-section">
        <h4>Сохраненные схемы:</h4>
        <div v-if="savedDiagrams.length === 0" class="empty-text">Нет сохраненных схем</div>
        <div v-else class="diagram-list">
          <div v-for="diagram in savedDiagrams" :key="diagram.id"
            class="diagram-item" :class="{ active: selectedDiagramId === diagram.id }"
            @click="selectDiagram(diagram.id)">
            <div class="diagram-info-left">
              <span class="diagram-name">{{ diagram.name }}</span>
              <span class="diagram-date">{{ new Date(diagram.created_at).toLocaleDateString() }}</span>
            </div>
            <div class="diagram-info-right">
              <span class="diagram-count">📦 {{ diagram.nodes_count || 0 }}</span>
              <button @click.stop="deleteDiagram(diagram.id)" class="btn-small" title="Удалить">🗑️</button>
            </div>
          </div>
        </div>
      </div>
      
      <div v-if="selectedNodeId || selectedConnectionId" class="delete-hint">
        Нажмите <kbd>Delete</kbd> для удаления
        <span v-if="selectedNodeId">блока</span>
        <span v-else-if="selectedConnectionId">связи</span>
      </div>
      
      <div class="toolbar">
        <div v-for="block in blockTypes" :key="block.id" class="tool-item" @click="createNode(block)">
          <img :src="getImageUrl(block.icon_url)" class="tool-icon" />
          <span>{{ block.default_text }}</span>
        </div>
      </div>
      
      <div v-if="selectedNodeId" class="properties">
        <h3>Свойства блока</h3>
        <input v-model="editedText" @input="updateNodeText" class="property-input" placeholder="Текст блока" />
        <div class="property-actions">
          <button @click="deleteNode(selectedNodeId)" class="btn delete-btn">🗑️ Удалить</button>
          <button @click="selectedNodeId = null" class="close-btn">✕</button>
        </div>
      </div>
      
      <div v-if="selectedConnectionId" class="properties connection-info">
        <h3>Связь</h3>
        <button @click="deleteConnection(selectedConnectionId)" class="btn delete-btn">🗑️ Удалить связь</button>
        <button @click="selectedConnectionId = null" class="close-btn">✕</button>
      </div>
    </aside>
    
    <main class="canvas"
      @mousemove="updateConnection"
      @mouseup="finishConnection"
      @mouseleave="isConnecting ? cancelConnection() : null">
      
      <svg class="svg-layer">
        <g v-for="conn in connections" :key="conn.id">
          <path :d="getConnectionPath(conn)"
            :class="{ 'connection-path': true, 'selected': selectedConnectionId === conn.id }"
            fill="none" stroke="#4CAF50" stroke-width="3"
            marker-end="url(#arrowhead)"
            @click="selectedConnectionId = conn.id; selectedNodeId = null"
            @dblclick="deleteConnection(conn.id)" />
        </g>
        
        <path v-if="isConnecting && connectionStartNode" :d="getTempPath()"
          fill="none" stroke="#9C27B0" stroke-width="3" stroke-dasharray="8,4"
          marker-end="url(#arrowhead-temp)" />
        
        <defs>
          <marker id="arrowhead" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
            <polygon points="0 0, 12 4, 0 8" fill="#4CAF50" />
          </marker>
          <marker id="arrowhead-temp" markerWidth="12" markerHeight="8" refX="10" refY="4" orient="auto">
            <polygon points="0 0, 12 4, 0 8" fill="#9C27B0" />
          </marker>
        </defs>
      </svg>
      
      <div v-for="node in nodes" :key="node.id"
        class="canvas-node"
        :class="{ 
          selected: selectedNodeId === node.id,
          'connection-source': isConnecting && connectionStartNode === node.id
        }"
        :style="{
          left: node.x + 'px',
          top: node.y + 'px',
          width: node.width + 'px',
          height: node.height + 'px'
        }"
        @mousedown="startDrag($event, node)"
        @click="selectNode(node)">
        <img :src="getImageUrl(node.iconUrl)" class="node-icon" />
        <span>{{ node.text }}</span>
        <div class="connection-dot" @mousedown.stop="startConnection($event, node.id)" title="Перетащите для связи"></div>
      </div>
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
  gap: 6px;
  flex-shrink: 0;
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
  transition: all 0.2s;
}

.save { background: #4CAF50; color: white; }
.save:hover { background: #45a049; }

.load { background: #2196F3; color: white; }
.load:hover { background: #1976D2; }

.clear { background: #ff6b6b; color: white; }
.clear:hover { background: #e55a5a; }

.clear-connections { background: #FF6F00; color: white; }
.clear-connections:hover:not(:disabled) { background: #E65100; }
.clear-connections:disabled { opacity: 0.4; cursor: not-allowed; }

.cancel { background: #f44336; color: white; }
.cancel:hover { background: #d32f2f; }

.connection-hint {
  background: #2d2d30;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid #9C27B0;
  color: #ccc;
  font-size: 12px;
  text-align: center;
}

.counters {
  display: flex;
  gap: 12px;
  color: #888;
  font-size: 11px;
  justify-content: center;
}

.delete-hint {
  color: #888;
  font-size: 11px;
  text-align: center;
  padding: 4px 0;
  flex-shrink: 0;
}

.delete-hint kbd {
  background: #1e1e1e;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid #444;
  color: #fff;
  font-size: 10px;
}

.diagram-section {
  margin-bottom: 6px;
  flex-shrink: 0;
}

.diagram-section h4 {
  color: #888;
  font-size: 11px;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.diagram-list {
  max-height: 100px;
  overflow-y: auto;
}

.diagram-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  margin-bottom: 2px;
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
  gap: 4px;
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

.empty-text {
  color: #888;
  font-size: 12px;
  padding: 6px;
  text-align: center;
}

.toolbar {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 6px;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  margin-bottom: 6px;
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
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.tool-item span {
  font-size: 13px;
  font-weight: 500;
}

.properties {
  padding: 12px;
  background: #2d2d30;
  border: 1px solid #3e3e42;
  border-radius: 6px;
  flex-shrink: 0;
}

.properties h3 {
  font-size: 13px;
  margin-bottom: 8px;
}

.property-input {
  width: 100%;
  padding: 6px 8px;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: white;
  font-size: 13px;
}

.property-input:focus {
  outline: none;
  border-color: #4CAF50;
}

.property-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
}

.connection-info {
  margin-top: 6px;
}

.delete-btn {
  background: #ff6b6b;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  flex: 1;
}
.delete-btn:hover { background: #e55a5a; }

.close-btn {
  margin-top: 0;
  padding: 5px 10px;
  background: #555;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  font-size: 13px;
}
.close-btn:hover { background: #666; }

.canvas {
  position: relative;
  flex: 1;
  background: #1e1e1e;
  cursor: default;
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
  cursor: grab;
  user-select: none;
  padding: 6px;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.canvas-node:hover {
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

.canvas-node.selected {
  border-color: #FFD700;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
}

.canvas-node.connection-source {
  border-color: #9C27B0 !important;
  box-shadow: 0 0 20px rgba(156, 39, 176, 0.5);
}

.node-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  margin-bottom: 3px;
}

.canvas-node span {
  font-size: 11px;
  text-align: center;
}

.connection-dot {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 16px;
  height: 16px;
  background: #9C27B0;
  border: 2px solid #fff;
  border-radius: 50%;
  cursor: crosshair;
  opacity: 0;
  transition: opacity 0.2s;
}

.canvas-node:hover .connection-dot {
  opacity: 1;
}

.connection-dot:hover {
  transform: scale(1.2);
}

.svg-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.connection-path {
  pointer-events: stroke;
  cursor: pointer;
  transition: stroke 0.2s, stroke-width 0.2s;
}

.connection-path:hover {
  stroke: #FFD700;
  stroke-width: 4;
}

.connection-path.selected {
  stroke: #FF6F00;
  stroke-width: 4;
}

.toolbar::-webkit-scrollbar {
  width: 6px;
}
.toolbar::-webkit-scrollbar-track { background: #252526; }
.toolbar::-webkit-scrollbar-thumb { background: #4CAF50; border-radius: 3px; }
</style>