const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');
const { HttpError, ah } = require('./errors');

async function loadUser(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  let payload;
  try {
    payload = jwt.verify(h.slice(7), config.jwtSecret);
  } catch (_) {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }
  const { rows } = await query('SELECT id_usuario, nombre, correo, rol, estado FROM usuario WHERE id_usuario = $1', [payload.sub]);
  const u = rows[0];
  if (!u) throw new HttpError(401, 'Sesión inválida');
  if (u.estado !== 'activo') throw new HttpError(403, 'Tu cuenta no está disponible');
  return u;
}

/** Autenticación opcional: si el token es inválido se trata como anónimo. */
const optionalAuth = ah(async (req, res, next) => {
  try { req.user = await loadUser(req); } catch (_) { req.user = null; }
  next();
});

const requireAuth = ah(async (req, res, next) => {
  const u = await loadUser(req);
  if (!u) throw new HttpError(401, 'Debes iniciar sesión');
  req.user = u;
  next();
});

/** Control de acceso por rol (RBAC). Incluye la autenticación. */
const requireRole = (...roles) => [
  requireAuth,
  (req, res, next) => {
    if (!roles.includes(req.user.rol)) return next(new HttpError(403, 'No tienes permiso para esta operación'));
    return next();
  },
];

module.exports = { optionalAuth, requireAuth, requireRole };
