const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { query } = require('../db');
const { HttpError, ah } = require('../middleware/errors');
const v = require('../middleware/validate');
const { sendMail } = require('../services/mailer');

const router = express.Router();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('contrasena-falsa-1A', 4); // iguala tiempos cuando el correo no existe

// HU-01 · Registro
router.post('/registro', ah(async (req, res) => {
  const b = req.body || {};
  const nombre = v.str(b.nombre, 'Nombre', { min: 2, max: 100 });
  const correo = v.email(b.correo);
  const password = v.password(b.password);
  const rol = v.oneOf(b.rol, 'Rol', ['turista', 'anfitrion', 'negocio']);
  const telefono = v.str(b.telefono, 'Teléfono', { max: 30, optional: true });
  if (b.acepta_datos !== true) throw new HttpError(400, 'Debes aceptar la política de tratamiento de datos personales');

  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const token = crypto.randomBytes(32).toString('hex');
  let rows;
  try {
    ({ rows } = await query(
      `INSERT INTO usuario (nombre, correo, password_hash, telefono, rol, acepta_datos, token_verificacion)
       VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id_usuario, nombre, correo, rol`,
      [nombre, correo, hash, telefono, rol, sha256(token)],
    ));
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'El correo ya está registrado');
    throw e;
  }
  sendMail(correo, 'Verifica tu correo - Eco Turismo',
    `Hola ${nombre}, confirma tu correo ingresando a: ${config.appUrl}/api/v1/auth/verificar?token=${token}`);
  res.status(201).json({ mensaje: 'Cuenta creada. Revisa tu correo para verificarla.', usuario: rows[0] });
}));

router.get('/verificar', ah(async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const { rowCount } = await query(
    'UPDATE usuario SET correo_verificado = true, token_verificacion = NULL WHERE token_verificacion = $1',
    [sha256(token)],
  );
  res.redirect(`${config.appUrl}/login?verificado=${rowCount ? 1 : 0}`);
}));

// HU-02 · Inicio de sesión (bloqueo temporal tras 5 intentos fallidos)
router.post('/login', ah(async (req, res) => {
  const b = req.body || {};
  const correo = v.email(b.correo);
  const password = typeof b.password === 'string' ? b.password : '';
  const { rows } = await query('SELECT * FROM usuario WHERE correo = $1', [correo]);
  const u = rows[0];
  if (!u) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw new HttpError(401, 'Credenciales inválidas');
  }
  if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
    throw new HttpError(429, 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta de nuevo en unos minutos.');
  }
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) {
    const intentos = u.intentos_fallidos + 1;
    if (intentos >= 5) {
      await query("UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = now() + interval '15 minutes' WHERE id_usuario = $1", [u.id_usuario]);
    } else {
      await query('UPDATE usuario SET intentos_fallidos = $2 WHERE id_usuario = $1', [u.id_usuario, intentos]);
    }
    throw new HttpError(401, 'Credenciales inválidas');
  }
  if (u.estado !== 'activo') throw new HttpError(403, 'Tu cuenta no está disponible');
  if (config.requireEmailVerification && !u.correo_verificado) throw new HttpError(403, 'Debes verificar tu correo antes de iniciar sesión');
  await query('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = $1', [u.id_usuario]);
  const token = jwt.sign({ sub: u.id_usuario, rol: u.rol }, config.jwtSecret, { expiresIn: config.jwtExpires });
  res.json({ token, usuario: { id_usuario: u.id_usuario, nombre: u.nombre, correo: u.correo, rol: u.rol } });
}));

// Recuperación de contraseña (respuesta genérica para no revelar si el correo existe)
router.post('/recuperar', ah(async (req, res) => {
  const correo = v.email((req.body || {}).correo);
  const { rows } = await query("SELECT id_usuario, nombre FROM usuario WHERE correo = $1 AND estado = 'activo'", [correo]);
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('hex');
    await query("UPDATE usuario SET reset_token_hash = $2, reset_expira = now() + interval '1 hour' WHERE id_usuario = $1", [rows[0].id_usuario, sha256(token)]);
    sendMail(correo, 'Restablece tu contraseña - Eco Turismo',
      `Hola ${rows[0].nombre}, restablece tu contraseña (vence en 1 hora): ${config.appUrl}/restablecer?token=${token}`);
  }
  res.json({ mensaje: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.' });
}));

router.post('/restablecer', ah(async (req, res) => {
  const b = req.body || {};
  const password = v.password(b.password);
  const token = v.str(b.token, 'Token', { max: 200 });
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const { rowCount } = await query(
    `UPDATE usuario SET password_hash = $2, reset_token_hash = NULL, reset_expira = NULL, intentos_fallidos = 0, bloqueado_hasta = NULL
      WHERE reset_token_hash = $1 AND reset_expira > now()`,
    [sha256(token), hash],
  );
  if (!rowCount) throw new HttpError(400, 'El enlace es inválido o ya venció');
  res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
}));

module.exports = router;
