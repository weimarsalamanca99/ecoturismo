const { tx, query } = require('../db');
const config = require('../config');

/** Libera los cupos de las reservas pendientes de pago cuya retención venció. */
async function releaseExpired() {
  return tx(async (c) => {
    const { rows } = await c.query(
      `SELECT id_reserva, id_publicacion, fecha_inicio, fecha_fin, cupos_usados FROM reserva
        WHERE estado = 'pendiente_pago' AND expira_en < now() ORDER BY id_reserva FOR UPDATE SKIP LOCKED`,
    );
    for (const r of rows) {
      await c.query(
        `UPDATE disponibilidad SET cupos_disponibles = LEAST(cupos_totales, cupos_disponibles + $4)
          WHERE id_publicacion = $1 AND fecha >= $2 AND fecha < $3`,
        [r.id_publicacion, r.fecha_inicio, r.fecha_fin, r.cupos_usados],
      );
      await c.query("UPDATE reserva SET estado = 'expirada' WHERE id_reserva = $1", [r.id_reserva]);
    }
    return rows.length;
  });
}

/** Resuelve pagos "pendientes" de la pasarela simulada (equivale a un webhook de confirmación). */
async function resolvePendingPayments() {
  return tx(async (c) => {
    const { rows } = await c.query(
      `SELECT p.id_pago, p.monto, p.id_reserva FROM pago p
        WHERE p.estado = 'pendiente' AND p.fecha < now() - interval '30 seconds' ORDER BY p.id_pago FOR UPDATE SKIP LOCKED`,
    );
    for (const p of rows) {
      const comision = Math.round(p.monto * config.comisionPct) / 100;
      await c.query("UPDATE pago SET estado = 'aprobado', comision = $2 WHERE id_pago = $1", [p.id_pago, comision]);
      await c.query("UPDATE reserva SET estado = 'confirmada', expira_en = NULL WHERE id_reserva = $1 AND estado = 'pendiente_pago'", [p.id_reserva]);
    }
    return rows.length;
  });
}

function start() {
  const run = async () => {
    try {
      await resolvePendingPayments();
      await releaseExpired();
    } catch (e) {
      console.error('Error en tarea programada:', e.message);
    }
  };
  const timer = setInterval(run, 60 * 1000);
  timer.unref();
  return timer;
}

module.exports = { start, releaseExpired, resolvePendingPayments, query };
