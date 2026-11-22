const express = require('express');
const { query, tx } = require('../db');
const config = require('../config');
const { HttpError, ah } = require('../middleware/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const v = require('../middleware/validate');
const { today, addDays, daysBetween } = require('../utils/dates');
const { sendMail } = require('../services/mailer');

const router = express.Router();

// HU-10 / HU-11 · Crear reserva con control de reservas simultáneas.
// Se bloquean (FOR UPDATE) las filas de disponibilidad del rango, siempre en el mismo orden (fecha),
// se verifican los cupos y se descuentan dentro de la misma transacción. El CHECK de la tabla impide valores negativos.
router.post('/', requireRole('turista'), ah(async (req, res) => {
  const b = req.body || {};
  const idPub = v.id(b.id_publicacion, 'id_publicacion');
  const personas = v.int(b.num_personas, 'num_personas', { min: 1, max: 500 });
  const inicio = v.date(b.fecha_inicio, 'fecha_inicio');
  if (inicio < today()) throw new HttpError(400, 'La fecha de inicio no puede estar en el pasado');

  const result = await tx(async (c) => {
    const { rows: pr } = await c.query(
      `SELECT p.*, u.correo AS correo_anfitrion FROM publicacion p JOIN usuario u ON u.id_usuario = p.id_anfitrion
        WHERE p.id_publicacion = $1 AND p.estado = 'publicada'`,
      [idPub],
    );
    const pub = pr[0];
    if (!pub) throw new HttpError(404, 'Publicación no disponible');
    if (pub.id_anfitrion === req.user.id_usuario) throw new HttpError(400, 'No puedes reservar tu propia publicación');
    if (personas > pub.capacidad) throw new HttpError(400, `La capacidad máxima es de ${pub.capacidad} personas`);

    let fin;
    let cupos;
    let total;
    if (pub.tipo === 'alojamiento') {
      fin = v.date(b.fecha_fin, 'fecha_fin');
      const noches = daysBetween(inicio, fin);
      if (noches < 1 || noches > 30) throw new HttpError(400, 'La estadía debe ser de 1 a 30 noches');
      cupos = 1; // se reserva la unidad completa (cabaña, habitación o finca)
      total = pub.precio_base * noches;
    } else {
      fin = addDays(inicio, 1); // una actividad ocupa un solo día
      cupos = personas;
      total = pub.precio_base * personas;
    }
    const noches = daysBetween(inicio, fin);

    const { rows: disp } = await c.query(
      `SELECT fecha, cupos_disponibles, bloqueado FROM disponibilidad
        WHERE id_publicacion = $1 AND fecha >= $2 AND fecha < $3 ORDER BY fecha FOR UPDATE`,
      [idPub, inicio, fin],
    );
    if (disp.length !== noches || disp.some((d) => d.bloqueado || d.cupos_disponibles < cupos)) {
      throw new HttpError(409, 'No hay disponibilidad para las fechas o la cantidad de personas seleccionadas');
    }
    await c.query(
      'UPDATE disponibilidad SET cupos_disponibles = cupos_disponibles - $4 WHERE id_publicacion = $1 AND fecha >= $2 AND fecha < $3',
      [idPub, inicio, fin, cupos],
    );
    const { rows } = await c.query(
      `INSERT INTO reserva (id_turista, id_publicacion, fecha_inicio, fecha_fin, num_personas, cupos_usados, total, estado, expira_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pendiente_pago', now() + make_interval(mins => $8::int)) RETURNING *`,
      [req.user.id_usuario, idPub, inicio, fin, personas, cupos, total, Math.round(config.retencionMin)],
    );
    return { reserva: rows[0], pub };
  });

  sendMail(req.user.correo, 'Reserva creada - Eco Turismo',
    `Tu reserva #${result.reserva.id_reserva} en "${result.pub.titulo}" quedó pendiente de pago. Tienes ${config.retencionMin} minutos para pagar.`);
  res.status(201).json(result.reserva);
}));

const LIST_SQL = `SELECT r.id_reserva, r.id_publicacion, r.fecha_inicio, r.fecha_fin, r.num_personas, r.total, r.estado, r.expira_en, r.creado_en,
    p.titulo, p.tipo, p.municipio,
    (SELECT i.id_imagen FROM imagen i WHERE i.id_publicacion = p.id_publicacion ORDER BY i.orden, i.id_imagen LIMIT 1) AS imagen_principal`;

// HU-19 · Historial del turista
router.get('/mias', requireRole('turista'), ah(async (req, res) => {
  const { rows } = await query(
    `${LIST_SQL},
       EXISTS (SELECT 1 FROM resena s WHERE s.id_reserva = r.id_reserva) AS tiene_resena,
       (r.estado = 'confirmada' AND r.fecha_fin <= $2 AND NOT EXISTS (SELECT 1 FROM resena s WHERE s.id_reserva = r.id_reserva)) AS puede_resenar
     FROM reserva r JOIN publicacion p ON p.id_publicacion = r.id_publicacion
     WHERE r.id_turista = $1 ORDER BY r.id_reserva DESC`,
    [req.user.id_usuario, today()],
  );
  res.json(rows);
}));

// HU-20 · Reservas recibidas por el anfitrión (el contacto del turista solo se muestra si está confirmada)
router.get('/recibidas', requireRole('anfitrion'), ah(async (req, res) => {
  const estado = req.query.estado ? v.oneOf(req.query.estado, 'estado', ['pendiente_pago', 'confirmada', 'cancelada', 'finalizada', 'expirada']) : null;
  const { rows } = await query(
    `${LIST_SQL}, u.nombre AS turista,
       CASE WHEN r.estado IN ('confirmada','finalizada') THEN u.correo END AS turista_correo,
       CASE WHEN r.estado IN ('confirmada','finalizada') THEN u.telefono END AS turista_telefono
     FROM reserva r JOIN publicacion p ON p.id_publicacion = r.id_publicacion JOIN usuario u ON u.id_usuario = r.id_turista
     WHERE p.id_anfitrion = $1 AND ($2::text IS NULL OR r.estado = $2) ORDER BY r.fecha_inicio DESC, r.id_reserva DESC`,
    [req.user.id_usuario, estado],
  );
  res.json(rows);
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  const id = v.id(req.params.id);
  const { rows } = await query(
    `${LIST_SQL}, p.id_anfitrion, r.id_turista
       FROM reserva r JOIN publicacion p ON p.id_publicacion = r.id_publicacion WHERE r.id_reserva = $1`,
    [id],
  );
  const r = rows[0];
  const allowed = r && (req.user.rol === 'administrador' || r.id_turista === req.user.id_usuario || r.id_anfitrion === req.user.id_usuario);
  if (!allowed) throw new HttpError(404, 'Reserva no encontrada');
  const pagos = await query('SELECT id_pago, monto, comision, estado, referencia, fecha FROM pago WHERE id_reserva = $1 ORDER BY id_pago', [id]);
  res.json({ ...r, pagos: pagos.rows });
}));

// HU-18 · Cancelación. Política: reembolso total si cancela el anfitrión o si el turista cancela con 48 horas o más de anticipación.
router.post('/:id/cancelar', requireAuth, ah(async (req, res) => {
  const id = v.id(req.params.id);
  const out = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT r.*, p.id_anfitrion, p.titulo FROM reserva r JOIN publicacion p ON p.id_publicacion = r.id_publicacion WHERE r.id_reserva = $1 FOR UPDATE OF r`,
      [id],
    );
    const r = rows[0];
    const esTurista = r && r.id_turista === req.user.id_usuario;
    const esAnfitrion = r && r.id_anfitrion === req.user.id_usuario;
    if (!r || !(esTurista || esAnfitrion || req.user.rol === 'administrador')) throw new HttpError(404, 'Reserva no encontrada');
    if (!['pendiente_pago', 'confirmada'].includes(r.estado)) throw new HttpError(409, 'La reserva no se puede cancelar en su estado actual');
    if (r.estado === 'confirmada' && r.fecha_inicio < today()) throw new HttpError(409, 'No se puede cancelar una reserva cuya fecha ya inició');

    // Liberar cupos
    await c.query(
      `UPDATE disponibilidad SET cupos_disponibles = LEAST(cupos_totales, cupos_disponibles + $4)
        WHERE id_publicacion = $1 AND fecha >= $2 AND fecha < $3`,
      [r.id_publicacion, r.fecha_inicio, r.fecha_fin, r.cupos_usados],
    );
    await c.query("UPDATE reserva SET estado = 'cancelada', expira_en = NULL WHERE id_reserva = $1", [id]);

    let reembolso = false;
    let monto = 0;
    if (r.estado === 'confirmada') {
      const conAnticipacion = daysBetween(today(), r.fecha_inicio) >= 2;
      reembolso = esAnfitrion || conAnticipacion;
      if (reembolso) {
        const p = await c.query("UPDATE pago SET estado = 'reembolsado' WHERE id_reserva = $1 AND estado = 'aprobado' RETURNING monto", [id]);
        monto = p.rows.reduce((s, x) => s + x.monto, 0);
      }
    }
    return { r, reembolso, monto };
  });
  sendMail(req.user.correo, 'Reserva cancelada - Eco Turismo',
    `La reserva #${id} en "${out.r.titulo}" fue cancelada.${out.reembolso ? ` Reembolso (simulado): $${out.monto}.` : ''}`);
  res.json({ estado: 'cancelada', reembolso: out.reembolso, monto_reembolsado: out.monto });
}));

module.exports = router;
