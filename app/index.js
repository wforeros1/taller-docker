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

/* ─── Manejo de errores en el pool ─── */
pool.on('error', (err) => {
  console.error('⚠️  Error en cliente inactivo del pool:', err.message);
});

/* ─── Auto-migración e Inicialización de Usuarios ─── */
async function inicializarBaseDatos() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id              SERIAL PRIMARY KEY,
        nombre          VARCHAR(100) NOT NULL,
        email           VARCHAR(150) NOT NULL UNIQUE,
        password        VARCHAR(255) NOT NULL,
        creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabla "usuarios" verificada/creada.');

    // Insertar administrador por defecto si la tabla está vacía
    const { rows } = await pool.query('SELECT COUNT(*) FROM usuarios');
    if (parseInt(rows[0].count) === 0) {
      const crypto = require('crypto');
      const salt = 'alquimia_secret_salt';
      const hash = crypto.createHmac('sha256', salt).update('admin123').digest('hex');
      const passwordHashed = `${salt}:${hash}`;
      await pool.query(
        `INSERT INTO usuarios (nombre, email, password) VALUES ($1, $2, $3)`,
        ['Administrador Alquimia', 'admin@alquimia.com', passwordHashed]
      );
      console.log('👤 Usuario administrador creado por defecto (admin@alquimia.com / admin123).');
    }
  } catch (err) {
    console.error('❌ Error al inicializar la base de datos:', err.message);
  }
}
inicializarBaseDatos();

/* ─── Helper: validación de campos requeridos ─── */
function validar(campos, body) {
  const faltantes = campos.filter(
    f => body[f] === undefined || body[f] === null || body[f] === ''
  );
  return faltantes.length
    ? `Campos requeridos faltantes: ${faltantes.join(', ')}`
    : null;
}

/* ══════════════════════════════════════
   HEALTHCHECK
   ══════════════════════════════════════ */
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      estado: 'healthy',
      base_de_datos: 'conectada',
      version: '2.0.0',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      estado: 'unhealthy',
      base_de_datos: 'desconectada',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/* ══════════════════════════════════════
   AUTENTICACIÓN (Rutas de Auth)
   ══════════════════════════════════════ */

// POST /api/auth/register - Registrar un nuevo usuario
app.post('/api/auth/register', async (req, res) => {
  const err = validar(['nombre', 'email', 'password'], req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { nombre, email, password } = req.body;
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
    const passwordHashed = `${salt}:${hash}`;

    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password)
       VALUES ($1, $2, $3) RETURNING id, nombre, email, creado_en`,
      [nombre, email, passwordHashed]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El email ya está registrado' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login - Iniciar sesión
app.post('/api/auth/login', async (req, res) => {
  const err = validar(['email', 'password'], req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = rows[0];
    const [salt, storedHash] = user.password.split(':');

    const crypto = require('crypto');
    const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');

    if (hash !== storedHash) return res.status(401).json({ error: 'Credenciales incorrectas' });

    // Crear un token simple firmado por el servidor (JWT-like sin dependencias)
    const payload = JSON.stringify({ id: user.id, email: user.email, nombre: user.nombre });
    const serverSecret = process.env.JWT_SECRET || 'alquimia_secreto_super_seguro_2026';
    const signature = crypto.createHmac('sha256', serverSecret).update(payload).digest('hex');
    const token = Buffer.from(payload).toString('base64') + '.' + signature;

    res.json({
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: { id: user.id, nombre: user.nombre, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me - Obtener información del usuario autenticado
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const token = authHeader.split(' ')[1];
    const parts = token.split('.');
    if (parts.length !== 2) return res.status(401).json({ error: 'Token inválido' });

    const [payloadB64, signature] = parts;
    const payloadStr = Buffer.from(payloadB64, 'base64').toString('utf8');

    const crypto = require('crypto');
    const serverSecret = process.env.JWT_SECRET || 'alquimia_secreto_super_seguro_2026';
    const expectedSignature = crypto.createHmac('sha256', serverSecret).update(payloadStr).digest('hex');

    if (signature !== expectedSignature) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const payload = JSON.parse(payloadStr);
    res.json({ usuario: payload });
  } catch (err) {
    res.status(401).json({ error: 'No autorizado' });
  }
});

/* ══════════════════════════════════════
   STATS — KPIs del Dashboard
   ══════════════════════════════════════ */
app.get('/api/stats', async (_req, res) => {
  try {
    const [kpiRes, topSvcRes, topClienteRes] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*)                         FROM clientes)                             AS total_clientes,
          (SELECT COUNT(*) FROM clientes WHERE tipo = 'VIP')                                  AS clientes_vip,
          (SELECT COUNT(*)                         FROM reservas)                             AS total_reservas,
          (SELECT COUNT(*) FROM reservas WHERE estado = 'PENDIENTE')                          AS reservas_pendientes,
          (SELECT COUNT(*) FROM reservas WHERE estado = 'PAGADO')                             AS reservas_pagadas,
          (SELECT COALESCE(SUM(monto),0) FROM reservas WHERE estado = 'PAGADO')               AS ingresos_cobrados,
          (SELECT COALESCE(SUM(monto),0) FROM reservas WHERE estado = 'PENDIENTE')            AS ingresos_pendientes,
          (SELECT COUNT(*) FROM servicios WHERE estado = 'ACTIVO')                            AS servicios_activos,
          (SELECT COUNT(*) FROM personal)                                                     AS total_personal,
          (SELECT COUNT(*) FROM personal WHERE disponible = TRUE)                             AS personal_disponible
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
      top_servicio:  topSvcRes.rows[0]     || null,
      top_cliente:   topClienteRes.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Ruta raíz: mapa de la API v2 ─── */
app.get('/', (_req, res) => {
  res.json({
    servicio: 'Alquimia Etérea API',
    version:  '2.0.0',
    endpoints: {
      healthcheck: { 'GET /api/health': 'Estado de salud del sistema' },
      stats:       { 'GET /api/stats':  'KPIs globales del dashboard' },
      clientes: {
        'GET    /api/clientes':           'Listar (filtros: ?tipo=VIP&search=texto)',
        'GET    /api/clientes/:id':       'Obtener por ID',
        'POST   /api/clientes':           'Crear',
        'PUT    /api/clientes/:id':       'Actualizar',
        'DELETE /api/clientes/:id':       'Eliminar',
      },
      servicios: {
        'GET    /api/servicios':          'Listar (filtros: ?categoria=X&estado=ACTIVO&search=texto)',
        'GET    /api/servicios/:id':      'Obtener por ID',
        'POST   /api/servicios':          'Crear',
        'PUT    /api/servicios/:id':      'Actualizar',
        'DELETE /api/servicios/:id':      'Eliminar',
      },
      reservas: {
        'GET    /api/reservas':           'Listar (filtros: ?estado=PENDIENTE&cliente_id=1)',
        'GET    /api/reservas/:id':       'Obtener por ID con JOINs',
        'POST   /api/reservas':           'Crear reserva',
        'PUT    /api/reservas/:id':       'Actualizar reserva completa',
        'PATCH  /api/reservas/:id/estado':'Cambiar solo el estado',
        'DELETE /api/reservas/:id':       'Eliminar',
      },
      personal: {
        'GET    /api/personal':           'Listar (filtro: ?disponible=true)',
        'POST   /api/personal':           'Crear miembro',
        'PUT    /api/personal/:id':       'Actualizar datos completos',
        'PATCH  /api/personal/:id/toggle':'Alternar disponibilidad',
        'DELETE /api/personal/:id':       'Eliminar',
      },
    },
  });
});

/* ══════════════════════════════════════
   CRUD — CLIENTES
   ══════════════════════════════════════ */

// GET todos (filtros opcionales: tipo, search)
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

// GET por id
app.get('/api/clientes/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST
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

// PUT
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

// DELETE
app.delete('/api/clientes/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ mensaje: 'Cliente eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   CRUD — SERVICIOS
   ══════════════════════════════════════ */

// GET todos (filtros: categoria, estado, search)
app.get('/api/servicios', async (req, res) => {
  try {
    const { categoria, estado, search } = req.query;
    let query = 'SELECT * FROM servicios';
    const params = [];
    const conditions = [];

    if (categoria) { params.push(categoria);       conditions.push(`categoria = $${params.length}`); }
    if (estado)    { params.push(estado);           conditions.push(`estado = $${params.length}`);    }
    if (search)    { params.push(`%${search}%`);   conditions.push(`nombre ILIKE $${params.length}`); }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY id';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET por id
app.get('/api/servicios/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM servicios WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST
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

// PUT
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

// DELETE
app.delete('/api/servicios/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM servicios WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json({ mensaje: 'Servicio eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   CRUD COMPLETO — RESERVAS
   ══════════════════════════════════════ */

const ESTADOS_RESERVA = ['PENDIENTE', 'PAGADO', 'CANCELADO', 'REEMBOLSADO'];

// GET todas (filtros: estado, cliente_id)
app.get('/api/reservas', async (req, res) => {
  try {
    const { estado, cliente_id } = req.query;
    let query = `
      SELECT r.*,
             c.nombre AS cliente_nombre, c.email AS cliente_email,
             s.nombre AS servicio_nombre, s.categoria AS servicio_categoria
      FROM reservas r
      JOIN clientes  c ON c.id = r.cliente_id
      JOIN servicios s ON s.id = r.servicio_id
    `;
    const params = [];
    const conditions = [];
    if (estado)     { params.push(estado);     conditions.push(`r.estado = $${params.length}`);     }
    if (cliente_id) { params.push(cliente_id); conditions.push(`r.cliente_id = $${params.length}`); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY r.fecha_reserva DESC, r.hora DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET por id
app.get('/api/reservas/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*,
             c.nombre AS cliente_nombre, c.email AS cliente_email,
             s.nombre AS servicio_nombre, s.categoria AS servicio_categoria
      FROM reservas r
      JOIN clientes  c ON c.id = r.cliente_id
      JOIN servicios s ON s.id = r.servicio_id
      WHERE r.id = $1
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST
app.post('/api/reservas', async (req, res) => {
  const err = validar(['cliente_id', 'servicio_id', 'fecha_reserva', 'hora', 'monto'], req.body);
  if (err) return res.status(400).json({ error: err });

  const estadoFinal = req.body.estado || 'PENDIENTE';
  if (!ESTADOS_RESERVA.includes(estadoFinal))
    return res.status(400).json({ error: `Estado inválido. Permitidos: ${ESTADOS_RESERVA.join(', ')}` });

  try {
    const { cliente_id, servicio_id, fecha_reserva, hora, monto, metodo_pago } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO reservas (cliente_id, servicio_id, fecha_reserva, hora, estado, monto, metodo_pago)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [cliente_id, servicio_id, fecha_reserva, hora, estadoFinal, monto, metodo_pago || null]
    );

    // Si la reserva se crea como PAGADO, actualizar el gasto_total y ultima_visita del cliente
    if (estadoFinal === 'PAGADO') {
      await pool.query(
        `UPDATE clientes
         SET gasto_total  = gasto_total + $1,
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

// PUT — actualización completa
app.put('/api/reservas/:id', async (req, res) => {
  const err = validar(['cliente_id', 'servicio_id', 'fecha_reserva', 'hora', 'monto', 'estado'], req.body);
  if (err) return res.status(400).json({ error: err });

  if (!ESTADOS_RESERVA.includes(req.body.estado))
    return res.status(400).json({ error: `Estado inválido. Permitidos: ${ESTADOS_RESERVA.join(', ')}` });

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

// PATCH — cambiar sólo el estado
app.patch('/api/reservas/:id/estado', async (req, res) => {
  const { estado } = req.body;
  if (!estado || !ESTADOS_RESERVA.includes(estado))
    return res.status(400).json({ error: `Estado inválido. Permitidos: ${ESTADOS_RESERVA.join(', ')}` });
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

// DELETE
app.delete('/api/reservas/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM reservas WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json({ mensaje: 'Reserva eliminada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════
   CRUD COMPLETO — PERSONAL
   ══════════════════════════════════════ */

// GET todos (filtro: ?disponible=true|false)
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

// POST
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

// PUT
app.put('/api/personal/:id', async (req, res) => {
  const err = validar(['nombre', 'cargo'], req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const { nombre, cargo, email, telefono, disponible } = req.body;
    const { rows } = await pool.query(
      `UPDATE personal SET nombre=$1, cargo=$2, email=$3, telefono=$4, disponible=$5
       WHERE id=$6 RETURNING *`,
      [nombre, cargo, email || null, telefono || null,
       disponible !== undefined ? disponible : true, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Personal no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El email ya está registrado' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH — toggle disponibilidad (sin body necesario)
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

// DELETE
app.delete('/api/personal/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM personal WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Personal no encontrado' });
    res.json({ mensaje: 'Personal eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Iniciar servidor ─── */
app.listen(PORT, () => {
  console.log(`✨ Alquimia Etérea API v2.0 corriendo en puerto ${PORT}`);
});
