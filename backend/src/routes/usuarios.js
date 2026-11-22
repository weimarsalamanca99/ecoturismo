const express = require('express');
const { query, tx } = require('../db');
const { HttpError, ah } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth');
const v = require('../middleware/validate');
const { today } = require('../utils/dates');

const router = express.Router();
router.use(requireAuth);

const PERFIL = 'id_usuario, nombre, correo, telefono, descripcion, rol, correo_verificado, creado_en';

// HU-03 · Perfil
router.get('/me', ah(async (req, res) => {
  const { rows } = await query(`SELECT ${PERFIL} FROM usuario WHERE id_usuario = $1`, [req.user.id_usuario]);
  res.json(rows[0]);
}));

router.put('/me', ah(async (req, res) => {
  const b = req.body || {};
  const nombre = v.str(b.nombre, 'Nombre', { min: 2, max: 100 });
  const telefono = v.str(b.telefono, 'Teléfono', { max: 30, optional: true });
  const descripcion = v.str(b.descripcion, 'Descripción', { max: 500, optional: true });
  const { rows } = await query(
    `UPDATE usuario SET nombre = $2, telefono = $3, descripcion = $4 WHERE id_usuario = $1 RETURNING ${PERFIL}`,
    [req.user.id_usuario, nombre, telefono, descripcion],
  );
  res.json(rows[0]);
}));

// Derecho de supresión (Ley 1581 de 2012): se anonimizan los datos personales.
router.delete('/me', ah(async (req, res) => {
  const id = req.user.id_usuario;
  await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT 1 FROM reserva r JOIN publicacion p ON p.id_publicacion = r.id_publicacion
        WHERE (r.id_turista = $1 OR p.id_anfitrion = $1) AND r.estado IN ('pendiente_pago','confirmada') AND r.fecha_fin >= $2 LIMIT 1`,
      [id, today()],
    );
    if (rows.length) throw new HttpError(409, 'No puedes eliminar tu cuenta con reservas activas. Cancélalas primero.');
    await c.query("UPDATE publicacion SET estado = 'pausada' WHERE id_anfitrion = $1 AND estado = 'publicada'", [id]);
    await c.query("UPDATE negocio_local SET estado = 'rechazado' WHERE id_usuario = $1", [id]);
    await c.query(
      `UPDATE usuario SET estado = 'eliminado', nombre = 'Usuario eliminado', correo = $2, telefono = NULL, descripcion = NULL,
         password_hash = 'eliminado', token_verificacion = NULL, reset_token_hash = NULL WHERE id_usuario = $1`,
      [id, `eliminado_${id}@eliminado.local`],
    );
  });
  res.status(204).end();
}));

module.exports = router;
