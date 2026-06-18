const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')

const app = express()
const port = 3000

// Middleware
app.use(cors())
app.use(express.json())

// Подключение к PostgreSQL
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
        COUNT(n.id) as nodes_count
      FROM diagrams d
      LEFT JOIN nodes n ON n.diagram_id = d.id
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
  
  const { name, projectId, nodes } = req.body
  
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
    for (const node of nodes) {
      const result = await client.query(
        `INSERT INTO nodes 
         (diagram_id, block_type_id, text_content, position_x, position_y, width, height) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
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
      console.log(`  ✅ Сохранен узел ID: ${result.rows[0].id}`)
    }
    
    await client.query('COMMIT')
    console.log(`✅ Схема "${name}" сохранена с ID: ${diagramId}`)
    
    res.json({ 
      id: diagramId, 
      message: 'Схема сохранена',
      nodesCount: nodes.length
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
        n.*, 
        bt.type_name, 
        bt.icon_url 
       FROM nodes n
       JOIN block_types bt ON n.block_type_id = bt.id
       WHERE n.diagram_id = $1
       ORDER BY n.id`,
      [id]
    )
    
    console.log(`✅ Загружено ${nodesResult.rows.length} узлов`)
    
    res.json({
      diagram: diagramResult.rows[0],
      nodes: nodesResult.rows
    })
    
  } catch (error) {
    console.error('❌ Ошибка загрузки:', error)
    res.status(500).json({ error: error.message })
  }
})

// ====== DELETE: Удалить диаграмму ======
app.delete('/api/diagrams/:id', async (req, res) => {
  const { id } = req.params
  
  try {
    await pool.query('DELETE FROM diagrams WHERE id = $1', [id])
    console.log(`🗑️ Удалена диаграмма ID: ${id}`)
    res.json({ message: 'Диаграмма удалена' })
  } catch (error) {
    console.error('❌ Ошибка удаления:', error)
    res.status(500).json({ error: error.message })
  }
})

// Запуск сервера
app.listen(port, () => {
  console.log('='.repeat(50))
  console.log(`✅ Сервер запущен на http://localhost:${port}`)
  console.log('📋 Доступные эндпоинты:')
  console.log(`   GET  /block-types        - типы блоков`)
  console.log(`   GET  /api/diagrams/list  - список схем`)
  console.log(`   POST /api/diagrams       - сохранить схему`)
  console.log(`   GET  /api/diagrams/:id   - загрузить схему`)
  console.log(`   DELETE /api/diagrams/:id - удалить схему`)
  console.log('='.repeat(50))
})