process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const http = require('http');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const app = require('../src/app');
const { pool, query } = require('../src/db');
const { migrate } = require('../src/migrate');

let server;
let base;

async function start() {
  await migrate();
  await query('TRUNCATE auditoria, resena, pago, reserva, disponibilidad, imagen, alojamiento, actividad, negocio_local, publicacion, usuario RESTART IDENTITY CASCADE');
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
}

async function stop() {
  await new Promise((r) => server.close(r));
  await pool.end();
}

/** Llama a la API y devuelve { status, body, headers }. */
async function call(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers, body: payload });
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch (_) { /* texto plano (CSV) */ }
  return { status: res.status, body: parsed, headers: res.headers };
}

async function register(correo, rol, nombre = 'Usuario Prueba') {
  const r = await call('POST', '/auth/registro', { body: { nombre, correo, password: 'Prueba123', rol, acepta_datos: true } });
  if (r.status !== 201) throw new Error(`registro falló: ${JSON.stringify(r.body)}`);
  const l = await call('POST', '/auth/login', { body: { correo, password: 'Prueba123' } });
  return { token: l.body.token, id: l.body.usuario.id_usuario };
}

async function createAdmin(correo = 'admin@test.co') {
  const hash = await bcrypt.hash('Prueba123', 4);
  await query("INSERT INTO usuario (nombre, correo, password_hash, rol, acepta_datos) VALUES ('Admin','" + correo + "',$1,'administrador',true)", [hash]);
  const l = await call('POST', '/auth/login', { body: { correo, password: 'Prueba123' } });
  return { token: l.body.token, id: l.body.usuario.id_usuario };
}

async function pngImage(color = '#2E7D32') {
  return sharp({ create: { width: 60, height: 40, channels: 3, background: color } }).png().toBuffer();
}

async function imageForm(n = 3) {
  const form = new FormData();
  for (let i = 0; i < n; i += 1) form.append('imagenes', new Blob([await pngImage()], { type: 'image/png' }), `foto${i}.png`);
  return form;
}

module.exports = { start, stop, call, register, createAdmin, imageForm, query };
