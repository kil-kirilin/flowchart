-- Таблица соединений (связей)
CREATE TABLE IF NOT EXISTS connections (
    id SERIAL PRIMARY KEY,
    diagram_id INTEGER REFERENCES diagrams(id) ON DELETE CASCADE,
    source_node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_connections_diagram ON connections(diagram_id);
CREATE INDEX IF NOT EXISTS idx_connections_source ON connections(source_node_id);
CREATE INDEX IF NOT EXISTS idx_connections_target ON connections(target_node_id);