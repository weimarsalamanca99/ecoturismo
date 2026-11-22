const express = require('express');
const { tx, query } = require('../db');
const { HttpError, ah } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const v = require('../middleware/validate');
const { today } = require('../utils/dates');
const { recalcRating } = require('../services/ratings');

const router = express.Router();

// HU-13 · Reseña (solo el turista, una vez por reserva y cuando la fecha del servicio ya terminó)
router.post('/', requireRole('turista'), ah(async (req, res) => {
  const b = req.body || {};
  const idReserva = v.id(b.id_reserva, 'id_reserva');
  const calificacion = v.int(b.calificacion, 'Calificación', { min: 1, max: 5 });
  const comentario = v.str(b.comentario, 'Comentario', { max: 1000, optional: true });

  const row = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM reserva WHERE id_reserva = $1 AND id_turista = $2 FOR UPDATE', [idReserva, req.user.id_usuario]);
    const r = rows[0];
    if (!r) throw new HttpError(404, 'Reserva no encontrada');
    if (!['confirmada', 'finalizada'].includes(r.estado) || r.fecha_fin > today()) {
      throw new HttpError(409, 'Solo puedes reseñar reservas confirmadas cuya fecha ya finalizó');
    }
    const ya = await c.query('SELECT 1 FROM resena WHERE id_reserva = $1', [idReserva]);
    if (ya.rows.length) throw new HttpError(409, 'Esta reserva ya tiene una reseña');
    const ins = await c.query(
      'INSERT INTO resena (id_reserva, id_publicacion, id_turista, calificacion, comentario) VALUES ($1,$2,$3,$4,$5) RETURNING id_resena, calificacion, comentario, fecha',
      [idReserva, r.id_publicacion, req.user.id_usuario, calificacion, comentario],
    );
    await c.query("UPDATE reserva SET estado = 'finalizada' WHERE id_reserva = $1", [idReserva]);
    await recalcRating(c, r.id_publicacion);
    return ins.rows[0];
  });
  res.status(201).json(row);
}));

// Reportar una reseña inapropiada (pasa a la cola de moderación)
router.post('/:id/reportar', requireAuth, ah(async (req, res) => {
  const id = v.id(req.params.id);
  const { rowCount } = await query("UPDATE resena SET estado_moderacion = 'reportada' WHERE id_resena = $1 AND estado_moderacion = 'aprobada'", [id]);
  if (!rowCount) throw new HttpError(404, 'Reseña no encontrada o ya reportada');
  res.json({ mensaje: 'Gracias, la reseña será revisada por un moderador.' });
}));

module.exports = router;
