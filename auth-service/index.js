const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5001;

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

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ servicio: 'auth-service', estado: 'healthy' });
  } catch (err) {
    res.status(500).json({ servicio: 'auth-service', estado: 'unhealthy', error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const err = validar(['nombre', 'email', 'password'], req.body);
  if (err) return res.status(400).json({ error: err });

  try {
    const { nombre, email, password } = req.body;
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

app.post('/api/auth/login', async (req, res) => {
  const err = validar(['email', 'password'], req.body);
  if (err) return res.status(400).json({ error: err });

  try {
    const { email, password } = req.body;
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = rows[0];
    const [salt, storedHash] = user.password.split(':');
    const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');

    if (hash !== storedHash) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const payload = JSON.stringify({ id: user.id, nombre: user.nombre, email: user.email });
    const serverSecret = process.env.JWT_SECRET || 'alquimia_secreto_super_seguro_2026';
    const signature = crypto.createHmac('sha256', serverSecret).update(payload).digest('hex');
    const token = `${Buffer.from(payload).toString('base64')}.${signature}`;

    res.json({ mensaje: 'Inicio de sesión exitoso', token, usuario: { id: user.id, nombre: user.nombre, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 2) return res.status(401).json({ error: 'Token inválido' });

    const [payloadB64, signature] = parts;
    const payloadStr = Buffer.from(payloadB64, 'base64').toString('utf8');
    const serverSecret = process.env.JWT_SECRET || 'alquimia_secreto_super_seguro_2026';
    const expectedSignature = crypto.createHmac('sha256', serverSecret).update(payloadStr).digest('hex');

    if (signature !== expectedSignature) return res.status(401).json({ error: 'Token inválido' });

    const payload = JSON.parse(payloadStr);
    res.json({ usuario: payload });
  } catch (_err) {
    res.status(401).json({ error: 'No autorizado' });
  }
});

app.get('/', (_req, res) => {
  res.json({
    servicio: 'auth-service',
    version: '1.0.0',
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      me: 'GET /api/auth/me',
      health: 'GET /api/health',
    },
  });
});

app.listen(PORT, () => {
  console.log(`✅ auth-service corriendo en puerto ${PORT}`);
});
