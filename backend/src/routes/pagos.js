const express = require('express');
const { tx } = require('../db');
const config = require('../config');
const { HttpError, ah } = require('../middleware/errors');
const { requireRole } = require('../middleware/auth');
const v = require('../middleware/validate');
const { charge } = require('../services/payments');
const { sendMail } = require('../services/mailer');

const router = express.Router();

// HU-12 · Pago electrónico (pasarela simulada). No se almacenan datos de la tarjeta.
router.post('/', requireRole('turista'), ah(async (req, res) => {
  const b = req.body || {};
  const idReserva = v.id(b.id_reserva, 'id_reserva');
  const tarjeta = b.tarjeta || {};

  const out = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT r.*, p.titulo FROM reserva r JOIN publicacion p ON p.id_publicacion = r.id_publicacion
        WHERE r.id_reserva = $1 AND r.id_turista = $2 FOR UPDATE OF r`,
      [idReserva, req.user.id_usuario],
    );
    const r = rows[0];
    if (!r) throw new HttpError(404, 'Reserva no encontrada');
    if (r.estado !== 'pendiente_pago') throw new HttpError(409, 'La reserva no está pendiente de pago');
    if (r.expira_en && new Date(r.expira_en) < new Date()) throw new HttpError(409, 'La retención del cupo venció. Crea una nueva reserva.');
    const pend = await c.query("SELECT 1 FROM pago WHERE id_reserva = $1 AND estado = 'pendiente'", [idReserva]);
    if (pend.rows.length) throw new HttpError(409, 'Ya hay un pago en proceso para esta reserva');

    const cobro = await charge({ tarjeta, monto: r.total });
    const comision = cobro.estado === 'aprobado' ? Math.round(r.total * config.comisionPct) / 100 : 0;
    const { rows: pg } = await c.query(
      'INSERT INTO pago (id_reserva, monto, comision, estado, referencia) VALUES ($1,$2,$3,$4,$5) RETURNING id_pago, monto, comision, estado, referencia, fecha',
      [idReserva, r.total, comision, cobro.estado, cobro.referencia],
    );
    if (cobro.estado === 'aprobado') {
      await c.query("UPDATE reserva SET estado = 'confirmada', expira_en = NULL WHERE id_reserva = $1", [idReserva]);
    } else if (cobro.estado === 'pendiente') {
      // Se amplía la retención mientras la pasarela confirma el pago.
      await c.query("UPDATE reserva SET expira_en = now() + interval '15 minutes' WHERE id_reserva = $1", [idReserva]);
    }
    return { pago: pg[0], titulo: r.titulo };
  });

  if (out.pago.estado === 'aprobado') {
    sendMail(req.user.correo, 'Pago aprobado - Eco Turismo',
      `Tu pago de $${out.pago.monto} para la reserva #${idReserva} en "${out.titulo}" fue aprobado. Referencia: ${out.pago.referencia}.`);
  }
  res.status(out.pago.estado === 'rechazado' ? 402 : 201).json(out.pago);
}));

module.exports = router;
