const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 5000;
const authTarget = process.env.AUTH_SERVICE_URL || 'http://auth-service:5001';
const bookingTarget = process.env.BOOKING_SERVICE_URL || 'http://booking-service:5002';
const JWT_SECRET = process.env.JWT_SECRET || 'alquimia_secreto_super_seguro_2026';

app.use(cors());

// ── Middleware de verificación JWT ──────────────────────────────────────────
// Verifica el token usando el mismo algoritmo que auth-service (HMAC-SHA256).
// Rutas públicas (sin token): POST /api/auth/login  y  POST /api/auth/register
function verificarJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado: token requerido' });
  }

  const token = authHeader.replace('Bearer ', '');
  const parts = token.split('.');
  if (parts.length !== 2) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  try {
    const [payloadB64, signature] = parts;
    const payloadStr = Buffer.from(payloadB64, 'base64').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadStr).digest('hex');

    if (signature !== expectedSig) {
      return res.status(401).json({ error: 'Token inválido: firma incorrecta' });
    }

    // Adjuntar el payload decodificado al request para uso posterior
    req.usuario = JSON.parse(payloadStr);
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Token inválido: no se pudo procesar' });
  }
}

// Rutas públicas → proxy directo al auth-service (login, register, health)
app.use('/api/auth', createProxyMiddleware({
  target: authTarget,
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/api/auth' },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
  },
}));

// Rutas protegidas → verificar JWT antes de hacer proxy al booking-service
app.use('/api', verificarJWT, createProxyMiddleware({
  target: bookingTarget,
  changeOrigin: true,
  pathRewrite: { '^/api': '/api' },
  onProxyReq: (proxyReq, req) => {
    proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
    // Reenviar el ID del usuario autenticado como header
    if (req.usuario) {
      proxyReq.setHeader('X-Usuario-Id', req.usuario.id);
      proxyReq.setHeader('X-Usuario-Email', req.usuario.email);
    }
  },
}));

// ── Rutas internas del gateway ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gateway: 'api-gateway' });
});

app.get('/', (_req, res) => {
  res.json({
    servicio: 'api-gateway',
    version: '1.0.0',
    rutas: {
      publicas: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        health: 'GET /api/auth/health',
      },
      protegidas: {
        me: 'GET /api/auth/me  (requiere Bearer token)',
        booking: '/api/*       (requiere Bearer token)',
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`✅ api-gateway corriendo en puerto ${PORT}`);
});
