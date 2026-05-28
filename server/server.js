const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')

const app = express()

app.use(cors())

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'flowchart_db',
    password: 'postgres',
    port: 5432,
})

app.get('/block-types', async (req, res) => {

    try {

        const result = await pool.query(
            'SELECT * FROM block_types ORDER BY id'
        )

        res.json(result.rows)

    } catch (error) {

        console.error(error)

        res.status(500).json({
            error: 'Database error'
        })

    }

})

app.listen(3000, () => {
    console.log('Server running on port 3000')
})