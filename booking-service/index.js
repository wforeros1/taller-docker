const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

pool.on('error', (err) => {
  console.error('Error en pool de PostgreSQL:', err.message);
});

function validar(campos, body) {
  const faltantes = campos.filter((campo) => {
    const valor = body[campo];
    return valor === undefined || valor === null || valor === '';
  });
  return faltantes.length ? `Campos requeridos faltantes: ${faltantes.join(', ')}` : null;
}

const ESTADOS_RESERVA = ['PENDIENTE', 'PAGADO', 'CANCELADO', 'REEMBOLSADO'];

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ servicio: 'booking-service', estado: 'healthy' });
  } catch (err) {
    res.status(500).json({ servicio: 'booking-service', estado: 'unhealthy', error: err.message });
  }
});

app.get('/', (_req, res) => {
  res.json({
    servicio: 'booking-service',
    version: '1.0.0',
    endpoints: {
      clientes: 'GET/POST/PUT/DELETE /api/clientes',
      servicios: 'GET/POST/PUT/DELETE /api/servicios',
      reservas: 'GET/POST/PUT/PATCH/DELETE /api/reservas',
      personal: 'GET/POST/PUT/PATCH/DELETE /api/personal',
      stats: 'GET /api/stats',
      health: 'GET /api/health',
    },
  });
});

app.get('/api/clientes', async (req, res) => {
  try {
    const { tipo, search } = req.query;
    let query = 'SELECT * FROM clientes';
    const params = [];
    const conditions = [];

    if (tipo) {
      params.push(tipo);
      conditions.push(`tipo = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(nombre ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY id';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clientes/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clientes', async (req, res) => {
  const err = validar(['nombre', 'email'], req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { nombre, email, telefono, tipo } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO clientes (nombre, email, telefono, tipo)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, email, telefono || null, tipo || 'Nuevo']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El email ya está registrado' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/clientes/:id', async (req, res) => {
  const err = validar(['nombre', 'email'], req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { nombre, email, telefono, tipo } = req.body;
    const { rows } = await pool.query(
      `UPDATE clientes SET nombre=$1, email=$2, telefono=$3, tipo=$4
       WHERE id=$5 RETURNING *`,
      [nombre, email, telefono || null, tipo, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El email ya está registrado' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ mensaje: 'Cliente eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/servicios', async (req, res) => {
  try {
    const { categoria, estado, search } = req.query;
    let query = 'SELECT * FROM servicios';
    const params = [];
    const conditions = [];

    if (categoria) { params.push(categoria); conditions.push(`categoria = $${params.length}`); }
    if (estado)    { params.push(estado);    conditions.push(`estado = $${params.length}`); }
    if (search)    { params.push(`%${search}%`); conditions.push(`nombre ILIKE $${params.length}`); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY id';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/servicios/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM servicios WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/servicios', async (req, res) => {
  const err = validar(['nombre', 'categoria', 'duracion_min', 'precio'], req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { nombre, categoria, duracion_min, precio, estado, descripcion } = req.body;
    if (Number(precio) <= 0) return res.status(400).json({ error: 'El precio debe ser mayor a 0' });
    const { rows } = await pool.query(
      `INSERT INTO servicios (nombre, categoria, duracion_min, precio, estado, descripcion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nombre, categoria, duracion_min, precio, estado || 'ACTIVO', descripcion || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/servicios/:id', async (req, res) => {
  const err = validar(['nombre', 'categoria', 'duracion_min', 'precio'], req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { nombre, categoria, duracion_min, precio, estado, descripcion } = req.body;
    const { rows } = await pool.query(
      `UPDATE servicios SET nombre=$1, categoria=$2, duracion_min=$3, precio=$4, estado=$5, descripcion=$6
       WHERE id=$7 RETURNING *`,
      [nombre, categoria, duracion_min, precio, estado, descripcion || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/servicios/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM servicios WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json({ mensaje: 'Servicio eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reservas', async (req, res) => {
  try {
    const { estado, cliente_id } = req.query;
    let query = `
      SELECT r.*, c.nombre AS cliente_nombre, c.email AS cliente_email,
             s.nombre AS servicio_nombre, s.categoria AS servicio_categoria
      FROM reservas r
      JOIN clientes c ON c.id = r.cliente_id
      JOIN servicios s ON s.id = r.servicio_id
    `;
    const params = [];
    const conditions = [];
    if (estado)     { params.push(estado);     conditions.push(`r.estado = $${params.length}`); }
    if (cliente_id) { params.push(cliente_id); conditions.push(`r.cliente_id = $${params.length}`); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY r.fecha_reserva DESC, r.hora DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reservas/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.nombre AS cliente_nombre, c.email AS cliente_email,
             s.nombre AS servicio_nombre, s.categoria AS servicio_categoria
      FROM reservas r
      JOIN clientes c ON c.id = r.cliente_id
      JOIN servicios s ON s.id = r.servicio_id
      WHERE r.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reservas', async (req, res) => {
  const err = validar(['cliente_id', 'servicio_id', 'fecha_reserva', 'hora', 'monto'], req.body);
  if (err) return res.status(400).json({ error: err });

  const estadoFinal = req.body.estado || 'PENDIENTE';
  if (!ESTADOS_RESERVA.includes(estadoFinal)) {
    return res.status(400).json({ error: `Estado inválido. Permitidos: ${ESTADOS_RESERVA.join(', ')}` });
  }

  try {
    const { cliente_id, servicio_id, fecha_reserva, hora, monto, metodo_pago } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO reservas (cliente_id, servicio_id, fecha_reserva, hora, estado, monto, metodo_pago)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [cliente_id, servicio_id, fecha_reserva, hora, estadoFinal, monto, metodo_pago || null]
    );

    if (estadoFinal === 'PAGADO') {
      await pool.query(
        `UPDATE clientes
         SET gasto_total = gasto_total + $1,
             ultima_visita = $2
         WHERE id = $3`,
        [monto, fecha_reserva, cliente_id]
      );
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Cliente o servicio no existe' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/reservas/:id', async (req, res) => {
  const err = validar(['cliente_id', 'servicio_id', 'fecha_reserva', 'hora', 'monto', 'estado'], req.body);
  if (err) return res.status(400).json({ error: err });
  if (!ESTADOS_RESERVA.includes(req.body.estado)) {
    return res.status(400).json({ error: `Estado inválido. Permitidos: ${ESTADOS_RESERVA.join(', ')}` });
  }

  try {
    const { cliente_id, servicio_id, fecha_reserva, hora, estado, monto, metodo_pago } = req.body;
    const { rows } = await pool.query(
      `UPDATE reservas
       SET cliente_id=$1, servicio_id=$2, fecha_reserva=$3, hora=$4,
           estado=$5, monto=$6, metodo_pago=$7
       WHERE id=$8 RETURNING *`,
      [cliente_id, servicio_id, fecha_reserva, hora, estado, monto, metodo_pago || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/reservas/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!estado || !ESTADOS_RESERVA.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Permitidos: ${ESTADOS_RESERVA.join(', ')}` });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE reservas SET estado=$1 WHERE id=$2 RETURNING *',
      [estado, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reservas/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM reservas WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({ mensaje: 'Reserva eliminada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/personal', async (req, res) => {
  try {
    const { disponible } = req.query;
    let query = 'SELECT * FROM personal';
    const params = [];
    if (disponible !== undefined) {
      params.push(disponible === 'true');
      query += ' WHERE disponible = $1';
    }
    query += ' ORDER BY id';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/personal', async (req, res) => {
  const err = validar(['nombre', 'cargo'], req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { nombre, cargo, email, telefono, disponible } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO personal (nombre, cargo, email, telefono, disponible)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nombre, cargo, email || null, telefono || null, disponible !== undefined ? disponible : true]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El email ya está registrado' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/personal/:id', async (req, res) => {
  const err = validar(['nombre', 'cargo'], req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { nombre, cargo, email, telefono, disponible } = req.body;
    const { rows } = await pool.query(
      `UPDATE personal SET nombre=$1, cargo=$2, email=$3, telefono=$4, disponible=$5
       WHERE id=$6 RETURNING *`,
      [nombre, cargo, email || null, telefono || null, disponible !== undefined ? disponible : true, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Personal no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El email ya está registrado' });
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/personal/:id/toggle', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE personal SET disponible = NOT disponible WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Personal no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/personal/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM personal WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Personal no encontrado' });
    res.json({ mensaje: 'Personal eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (_req, res) => {
  try {
    const [kpiRes, topSvcRes, topClienteRes] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM clientes) AS total_clientes,
          (SELECT COUNT(*) FROM clientes WHERE tipo = 'VIP') AS clientes_vip,
          (SELECT COUNT(*) FROM reservas) AS total_reservas,
          (SELECT COUNT(*) FROM reservas WHERE estado = 'PENDIENTE') AS reservas_pendientes,
          (SELECT COUNT(*) FROM reservas WHERE estado = 'PAGADO') AS reservas_pagadas,
          (SELECT COALESCE(SUM(monto),0) FROM reservas WHERE estado = 'PAGADO') AS ingresos_cobrados,
          (SELECT COALESCE(SUM(monto),0) FROM reservas WHERE estado = 'PENDIENTE') AS ingresos_pendientes,
          (SELECT COUNT(*) FROM servicios WHERE estado = 'ACTIVO') AS servicios_activos,
          (SELECT COUNT(*) FROM personal) AS total_personal,
          (SELECT COUNT(*) FROM personal WHERE disponible = TRUE) AS personal_disponible
      `),
      pool.query(`
        SELECT s.nombre, s.categoria, COUNT(r.id) AS total_reservas
        FROM servicios s
        LEFT JOIN reservas r ON r.servicio_id = s.id
        GROUP BY s.id, s.nombre, s.categoria
        ORDER BY total_reservas DESC
        LIMIT 1
      `),
      pool.query(`
        SELECT c.nombre, c.tipo, c.gasto_total
        FROM clientes c
        ORDER BY c.gasto_total DESC
        LIMIT 1
      `),
    ]);

    res.json({
      ...kpiRes.rows[0],
      top_servicio: topSvcRes.rows[0] || null,
      top_cliente: topClienteRes.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/fecha', (_req, res) => {
  const ahora = new Date();
  const fechaIso = ahora.toISOString().slice(0, 10);
  const fechaLabel = ahora.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  res.json({ fecha: fechaIso, label: fechaLabel });
});

app.listen(PORT, () => {
  console.log(`✅ booking-service corriendo en puerto ${PORT}`);
});
