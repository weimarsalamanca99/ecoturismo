class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Envuelve handlers async para que los errores lleguen al manejador central (Express 4). */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  }
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande' });
  if (err && err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Cada imagen debe pesar máximo 5 MB' : 'Error al cargar archivos';
    return res.status(400).json({ error: msg });
  }
  if (err && err.code) {
    // Errores de PostgreSQL
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
    if (err.code === '23514') return res.status(409).json({ error: 'La operación viola una regla de integridad (por ejemplo, cupos insuficientes)' });
    if (err.code === '23503') return res.status(409).json({ error: 'La operación referencia datos inexistentes o en uso' });
    if (err.code === '22P02' || err.code === '22007' || err.code === '22008') return res.status(400).json({ error: 'Datos con formato inválido' });
  }
  console.error('Error no controlado:', err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = { HttpError, ah, errorHandler };
