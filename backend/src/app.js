const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { query } = require('./db');
const { errorHandler, HttpError } = require('./middleware/errors');

const app = express();
app.set('trust proxy', 1); // detrás de Nginx / Render / Caddy
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://tile.openstreetmap.org'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': config.env === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin.split(','), credentials: false }));
app.use(express.json({ limit: '100kb' }));

if (!config.rateLimitDisabled) {
  const limiter = (windowMs, max) => rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, 'Demasiadas solicitudes. Intenta de nuevo más tarde.')),
  });
  app.use('/api/', limiter(60 * 1000, 300));
  app.use(['/api/v1/auth/login', '/api/v1/auth/registro', '/api/v1/auth/recuperar', '/api/v1/auth/restablecer'], limiter(15 * 60 * 1000, 30));
}

const api = express.Router();
api.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ estado: 'ok', hora: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ estado: 'error', error: 'Base de datos no disponible' });
  }
});
api.use('/auth', require('./routes/auth'));
api.use('/usuarios', require('./routes/usuarios'));
api.use('/publicaciones', require('./routes/publicaciones'));
api.use('/imagenes', require('./routes/imagenes'));
api.use('/reservas', require('./routes/reservas'));
api.use('/pagos', require('./routes/pagos'));
api.use('/resenas', require('./routes/resenas'));
api.use('/negocios', require('./routes/negocios'));
api.use('/admin', require('./routes/admin'));
api.use((req, res, next) => next(new HttpError(404, 'Ruta no encontrada')));
app.use('/api/v1', api);

// Frontend (SPA de Vue) compilado: se sirve desde ./public cuando existe.
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  app.use(express.static(publicDir, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

app.use(errorHandler);
module.exports = app;
