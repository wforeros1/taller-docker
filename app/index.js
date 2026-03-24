const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/* ─── Conexión a PostgreSQL ─── */
const pool = new Pool({
  host:     process.env.DB_HOST     || 'db',
  port:     parseInt(process.env.DB_PORT || '5432'),
  user:     process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

/* ─── Ruta raíz: lista de endpoints ─── */
app.get('/', (_req, res) => {
  res.json({
    servicio: 'Alquimia Etérea API',
    endpoints: {
      clientes: {
        'GET    /api/clientes':      'Listar todos los clientes',
        'GET    /api/clientes/:id':  'Obtener un cliente por ID',
        'POST   /api/clientes':      'Crear un cliente',
        'PUT    /api/clientes/:id':  'Actualizar un cliente',
        'DELETE /api/clientes/:id':  'Eliminar un cliente',
      },
      servicios: {
        'GET    /api/servicios':      'Listar todos los servicios',
        'GET    /api/servicios/:id':  'Obtener un servicio por ID',
        'POST   /api/servicios':      'Crear un servicio',
        'PUT    /api/servicios/:id':  'Actualizar un servicio',
        'DELETE /api/servicios/:id':  'Eliminar un servicio',
      },
      reservas:  { 'GET /api/reservas':  'Listar reservas (con cliente y servicio)' },
      personal:  { 'GET /api/personal':  'Listar personal y disponibilidad' },
    },
  });
});

/* ══════════════════════════════════════
   CRUD — CLIENTES
   ══════════════════════════════════════ */

// GET todos
app.get('/api/clientes', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clientes ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET por id
app.get('/api/clientes/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST
app.post('/api/clientes', async (req, res) => {
  try {
    const { nombre, email, telefono, tipo } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO clientes (nombre, email, telefono, tipo)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, email, telefono, tipo || 'Nuevo']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT
app.put('/api/clientes/:id', async (req, res) => {
  try {
    const { nombre, email, telefono, tipo } = req.body;
    const { rows } = await pool.query(
      `UPDATE clientes SET nombre=$1, email=$2, telefono=$3, tipo=$4
       WHERE id=$5 RETURNING *`,
      [nombre, email, telefono, tipo, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ mensaje: 'Cliente eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   CRUD — SERVICIOS
   ══════════════════════════════════════ */

// GET todos
app.get('/api/servicios', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM servicios ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET por id
app.get('/api/servicios/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM servicios WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST
app.post('/api/servicios', async (req, res) => {
  try {
    const { nombre, categoria, duracion_min, precio, estado, descripcion } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO servicios (nombre, categoria, duracion_min, precio, estado, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nombre, categoria, duracion_min, precio, estado || 'ACTIVO', descripcion]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT
app.put('/api/servicios/:id', async (req, res) => {
  try {
    const { nombre, categoria, duracion_min, precio, estado, descripcion } = req.body;
    const { rows } = await pool.query(
      `UPDATE servicios SET nombre=$1, categoria=$2, duracion_min=$3, precio=$4, estado=$5, descripcion=$6
       WHERE id=$7 RETURNING *`,
      [nombre, categoria, duracion_min, precio, estado, descripcion, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
app.delete('/api/servicios/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM servicios WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json({ mensaje: 'Servicio eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   LECTURA — RESERVAS (con JOIN)
   ══════════════════════════════════════ */
app.get('/api/reservas', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.nombre AS cliente_nombre, s.nombre AS servicio_nombre
      FROM reservas r
      JOIN clientes  c ON c.id = r.cliente_id
      JOIN servicios s ON s.id = r.servicio_id
      ORDER BY r.fecha_reserva DESC, r.hora DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   LECTURA — PERSONAL
   ══════════════════════════════════════ */
app.get('/api/personal', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM personal ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Iniciar servidor ─── */
app.listen(PORT, () => {
  console.log(`✨ Alquimia Etérea API corriendo en puerto ${PORT}`);
});
