// Configuración centralizada a partir de variables de entorno.
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'si'].includes(String(v).toLowerCase()));

const config = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://eco:eco@localhost:5432/ecoturismo',
  dbSsl: bool(process.env.DB_SSL, false),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '2h',
  appUrl: (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000').replace(/\/$/, ''),
  corsOrigin: process.env.CORS_ORIGIN || '',
  tz: process.env.APP_TZ || 'America/Bogota',
  comisionPct: num(process.env.COMISION_PORCENTAJE, 10),
  retencionMin: num(process.env.RESERVA_RETENCION_MIN, 10),
  minImagenes: num(process.env.MIN_IMAGENES, 3),
  bcryptRounds: num(process.env.BCRYPT_ROUNDS, 10),
  requireEmailVerification: bool(process.env.REQUIRE_EMAIL_VERIFICATION, false),
  rateLimitDisabled: bool(process.env.RATE_LIMIT_DISABLED, false),
  seedDemo: bool(process.env.SEED_DEMO, false),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Eco Turismo <no-reply@ecoturismo.local>',
  },
};

if (config.env === 'production' && config.jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET es obligatorio en producción');
}
module.exports = config;
