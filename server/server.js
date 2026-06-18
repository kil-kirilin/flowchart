const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')

const app = express()
const port = 3000

// ====== MIDDLEWARE ======
app.use(cors())
app.use(express.json())

// ====== ПОДКЛЮЧЕНИЕ К POSTGRESQL ======
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'flowchart_db',
  password: 'postgres',
  port: 5432,
})

// Проверка подключения к БД
pool.connect((err) => {
  if (err) {
    console.error('❌ Ошибка подключения к БД:', err)
  } else {
    console.log('✅ Подключено к PostgreSQL')
  }
})

// ====== GET: Получить все типы блоков ======
app.get('/block-types', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM block_types ORDER BY id')
    res.json(result.rows)
  } catch (error) {
    console.error('❌ Ошибка /block-types:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====== GET: Список всех схем ======
app.get('/api/diagrams/list', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.id,
        d.name,
        d.created_at,
        d.project_id,
        COUNT(DISTINCT n.id) as nodes_count,
        COUNT(DISTINCT c.id) as connections_count
      FROM diagrams d
      LEFT JOIN nodes n ON n.diagram_id = d.id
      LEFT JOIN connections c ON c.diagram_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `)
    res.json(result.rows)
  } catch (error) {
    console.error('❌ Ошибка /api/diagrams/list:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====== POST: Сохранить диаграмму ======
app.post('/api/diagrams', async (req, res) => {
  console.log('📥 Получен запрос на сохранение')
  console.log('📦 Данные:', JSON.stringify(req.body, null, 2))
  
  const { name, projectId, nodes, connections } = req.body
  
  // Проверяем, что данные пришли
  if (!name) {
    return res.status(400).json({ error: 'Отсутствует название схемы' })
  }
  
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return res.status(400).json({ error: 'Нет блоков для сохранения' })
  }
  
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    
    // Проверяем, существует ли проект с таким id
    let projectIdToUse = projectId || 1
    
    const projectCheck = await client.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectIdToUse]
    )
    
    if (projectCheck.rows.length === 0) {
      // Если проекта нет, создаем
      const newProject = await client.query(
        'INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING id',
        ['Мой проект', 'Автоматически созданный проект']
      )
      projectIdToUse = newProject.rows[0].id
      console.log('✅ Создан новый проект с ID:', projectIdToUse)
    }
    
    // Создаем диаграмму
    const diagramResult = await client.query(
      'INSERT INTO diagrams (name, project_id) VALUES ($1, $2) RETURNING id',
      [name, projectIdToUse]
    )
    const diagramId = diagramResult.rows[0].id
    console.log('✅ Создана диаграмма с ID:', diagramId)
    
    // Сохраняем узлы
    const savedNodes = []
    for (const node of nodes) {
      const result = await client.query(
        `INSERT INTO nodes 
         (diagram_id, block_type_id, text_content, position_x, position_y, width, height) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, position_x, position_y`,
        [
          diagramId, 
          node.typeId, 
          node.text || '', 
          Math.round(node.x), 
          Math.round(node.y), 
          node.width || 120, 
          node.height || 60
        ]
      )
      savedNodes.push({
        id: result.rows[0].id,
        position_x: result.rows[0].position_x,
        position_y: result.rows[0].position_y
      })
      console.log(`  ✅ Сохранен узел ID: ${result.rows[0].id}`)
    }
    
    // Сохраняем связи, если они есть
    if (connections && Array.isArray(connections) && connections.length > 0) {
      console.log(`🔗 Сохранение ${connections.length} связей...`)
      
      // Создаем карту для поиска ID узлов
      const nodeMap = new Map()
      savedNodes.forEach((savedNode, index) => {
        const originalNode = nodes[index]
        if (originalNode) {
          nodeMap.set(originalNode.id, savedNode.id)
        }
      })
      
      let savedConnections = 0
      for (const conn of connections) {
        const sourceDbId = nodeMap.get(conn.sourceId)
        const targetDbId = nodeMap.get(conn.targetId)
        
        if (sourceDbId && targetDbId) {
          await client.query(
            `INSERT INTO connections 
             (diagram_id, source_node_id, target_node_id) 
             VALUES ($1, $2, $3)`,
            [diagramId, sourceDbId, targetDbId]
          )
          savedConnections++
          console.log(`  ✅ Сохранена связь: ${conn.sourceId} -> ${conn.targetId}`)
        } else {
          console.warn(`  ⚠️ Связь пропущена: ${conn.sourceId} -> ${conn.targetId} (узлы не найдены)`)
        }
      }
      console.log(`✅ Сохранено ${savedConnections} связей`)
    }
    
    await client.query('COMMIT')
    console.log(`✅ Схема "${name}" сохранена с ID: ${diagramId}`)
    
    res.json({ 
      id: diagramId, 
      message: 'Схема сохранена',
      nodesCount: nodes.length,
      connectionsCount: connections ? connections.length : 0
    })
    
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('❌ Ошибка при сохранении:', error)
    res.status(500).json({ 
      error: error.message,
      detail: error.detail || 'Неизвестная ошибка'
    })
  } finally {
    client.release()
  }
})

// ====== GET: Загрузить диаграмму ======
app.get('/api/diagrams/:id', async (req, res) => {
  const { id } = req.params
  console.log(`📥 Загрузка диаграммы ID: ${id}`)
  
  try {
    // Получаем информацию о диаграмме
    const diagramResult = await pool.query(
      'SELECT * FROM diagrams WHERE id = $1',
      [id]
    )
    
    if (diagramResult.rows.length === 0) {
      return res.status(404).json({ error: 'Диаграмма не найдена' })
    }
    
    // Получаем узлы
    const nodesResult = await pool.query(
      `SELECT 
        n.id,
        n.diagram_id,
        n.block_type_id,
        n.text_content,
        n.position_x,
        n.position_y,
        n.width,
        n.height,
        n.created_at,
        bt.type_name, 
        bt.icon_url 
       FROM nodes n
       JOIN block_types bt ON n.block_type_id = bt.id
       WHERE n.diagram_id = $1
       ORDER BY n.id`,
      [id]
    )
    
    // Получаем связи
    const connectionsResult = await pool.query(
      `SELECT 
        id,
        source_node_id,
        target_node_id,
        created_at
       FROM connections 
       WHERE diagram_id = $1
       ORDER BY id`,
      [id]
    )
    
    console.log(`✅ Загружено ${nodesResult.rows.length} узлов и ${connectionsResult.rows.length} связей`)
    
    res.json({
      diagram: diagramResult.rows[0],
      nodes: nodesResult.rows,
      connections: connectionsResult.rows
    })
    
  } catch (error) {
    console.error('❌ Ошибка загрузки:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====== DELETE: Удалить диаграмму ======
app.delete('/api/diagrams/:id', async (req, res) => {
  const { id } = req.params
  console.log(`🗑️ Удаление диаграммы ID: ${id}`)
  
  try {
    // Проверяем, существует ли диаграмма
    const checkResult = await pool.query(
      'SELECT id FROM diagrams WHERE id = $1',
      [id]
    )
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Диаграмма не найдена' })
    }
    
    // Удаляем диаграмму (связи и узлы удаляются каскадно)
    await pool.query('DELETE FROM diagrams WHERE id = $1', [id])
    
    console.log(`✅ Диаграмма ID: ${id} удалена`)
    res.json({ 
      message: 'Диаграмма удалена',
      id: parseInt(id)
    })
  } catch (error) {
    console.error('❌ Ошибка удаления:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====== GET: Получить все проекты ======
app.get('/api/projects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY id')
    res.json(result.rows)
  } catch (error) {
    console.error('❌ Ошибка /api/projects:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====== POST: Создать проект ======
app.post('/api/projects', async (req, res) => {
  const { name, description } = req.body
  
  if (!name) {
    return res.status(400).json({ error: 'Отсутствует название проекта' })
  }
  
  try {
    const result = await pool.query(
      'INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || '']
    )
    res.json(result.rows[0])
  } catch (error) {
    console.error('❌ Ошибка создания проекта:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====== DELETE: Удалить проект ======
app.delete('/api/projects/:id', async (req, res) => {
  const { id } = req.params
  
  try {
    // Проверяем, существует ли проект
    const checkResult = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [id]
    )
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Проект не найден' })
    }
    
    await pool.query('DELETE FROM projects WHERE id = $1', [id])
    
    res.json({ 
      message: 'Проект удален',
      id: parseInt(id)
    })
  } catch (error) {
    console.error('❌ Ошибка удаления проекта:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====== GET: Получить связи диаграммы ======
app.get('/api/diagrams/:id/connections', async (req, res) => {
  const { id } = req.params
  
  try {
    const result = await pool.query(
      `SELECT 
        c.id,
        c.source_node_id,
        c.target_node_id,
        sn.text_content as source_text,
        tn.text_content as target_text,
        sn.position_x as source_x,
        sn.position_y as source_y,
        tn.position_x as target_x,
        tn.position_y as target_y
       FROM connections c
       JOIN nodes sn ON sn.id = c.source_node_id
       JOIN nodes tn ON tn.id = c.target_node_id
       WHERE c.diagram_id = $1`,
      [id]
    )
    res.json(result.rows)
  } catch (error) {
    console.error('❌ Ошибка получения связей:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====== GET: Проверка соединения с БД ======
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()')
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message
    })
  }
})

// ====== ЗАПУСК СЕРВЕРА ======
app.listen(port, () => {
  console.log('='.repeat(60))
  console.log(`✅ Сервер запущен на http://localhost:${port}`)
  console.log('📋 Доступные эндпоинты:')
  console.log('')
  console.log('  📦 Блоки:')
  console.log(`    GET  /block-types              - типы блоков`)
  console.log('')
  console.log('  📊 Диаграммы:')
  console.log(`    GET  /api/diagrams/list        - список всех схем`)
  console.log(`    POST /api/diagrams             - сохранить схему`)
  console.log(`    GET  /api/diagrams/:id         - загрузить схему`)
  console.log(`    DELETE /api/diagrams/:id       - удалить схему`)
  console.log(`    GET  /api/diagrams/:id/connections - связи схемы`)
  console.log('')
  console.log('  📁 Проекты:')
  console.log(`    GET  /api/projects             - список проектов`)
  console.log(`    POST /api/projects             - создать проект`)
  console.log(`    DELETE /api/projects/:id       - удалить проект`)
  console.log('')
  console.log('  🏥 Здоровье:')
  console.log(`    GET  /api/health               - проверка соединения с БД`)
  console.log('='.repeat(60))
})