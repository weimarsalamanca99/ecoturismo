const express = require('express');
const { query, tx } = require('../db');
const { HttpError, ah } = require('../middleware/errors');
const { requireRole } = require('../middleware/auth');
const v = require('../middleware/validate');
const { audit } = require('../services/audit');
const { recalcRating } = require('../services/ratings');
const { sendMail } = require('../services/mailer');
const { today, addDays } = require('../utils/dates');

const router = express.Router();
router.use(requireRole('administrador'));

// HU-16 · Indicadores
router.get('/resumen', ah(async (req, res) => {
  const { rows } = await query(`SELECT
    (SELECT count(*) FROM reserva WHERE creado_en >= date_trunc('month', now())) AS reservas_mes,
    (SELECT COALESCE(sum(monto),0) FROM pago WHERE estado = 'aprobado' AND fecha >= date_trunc('month', now())) AS ingresos_mes,
    (SELECT COALESCE(sum(comision),0) FROM pago WHERE estado = 'aprobado' AND fecha >= date_trunc('month', now())) AS comisiones_mes,
    (SELECT count(*) FROM usuario WHERE estado = 'activo') AS usuarios_activos,
    (SELECT count(*) FROM publicacion WHERE estado = 'pendiente') AS publicaciones_pendientes,
    (SELECT count(*) FROM negocio_local WHERE estado = 'pendiente') AS negocios_pendientes,
    (SELECT count(*) FROM resena WHERE estado_moderacion = 'reportada') AS resenas_reportadas`);
  const serie = await query(
    `SELECT to_char(date_trunc('month', creado_en), 'YYYY-MM') AS mes, count(*) AS reservas FROM reserva
      WHERE creado_en >= date_trunc('month', now()) - interval '6 months' GROUP BY 1 ORDER BY 1`,
  );
  res.json({ ...rows[0], reservas_por_mes: serie.rows });
}));

// HU-14 · Gestión de usuarios
router.get('/usuarios', ah(async (req, res) => {
  const params = [];
  const where = ['1=1'];
  if (req.query.q) { params.push(`%${String(req.query.q).slice(0, 100).replace(/[%_\\]/g, '\\$&')}%`); where.push(`(nombre ILIKE $${params.length} OR correo ILIKE $${params.length})`); }
  if (req.query.rol) { params.push(v.oneOf(req.query.rol, 'rol', ['turista', 'anfitrion', 'administrador', 'negocio'])); where.push(`rol = $${params.length}`); }
  if (req.query.estado) { params.push(v.oneOf(req.query.estado, 'estado', ['activo', 'suspendido', 'eliminado'])); where.push(`estado = $${params.length}`); }
  const limite = req.query.limite ? v.int(req.query.limite, 'limite', { min: 1, max: 100 }) : 25;
  const pagina = req.query.pagina ? v.int(req.query.pagina, 'pagina', { min: 1 }) : 1;
  params.push(limite, (pagina - 1) * limite);
  const { rows } = await query(
    `SELECT id_usuario, nombre, correo, telefono, rol, estado, correo_verificado, creado_en, count(*) OVER() AS total
       FROM usuario WHERE ${where.join(' AND ')} ORDER BY id_usuario DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ datos: rows.map(({ total: _t, ...r }) => r), total: rows[0] ? rows[0].total : 0, pagina, limite });
}));

router.patch('/usuarios/:id/estado', ah(async (req, res) => {
  const id = v.id(req.params.id);
  const estado = v.oneOf((req.body || {}).estado, 'estado', ['activo', 'suspendido']);
  if (id === req.user.id_usuario) throw new HttpError(400, 'No puedes cambiar el estado de tu propia cuenta');
  await tx(async (c) => {
    const { rows } = await c.query("UPDATE usuario SET estado = $2 WHERE id_usuario = $1 AND estado <> 'eliminado' RETURNING id_usuario", [id, estado]);
    if (!rows.length) throw new HttpError(404, 'Usuario no encontrado');
    await audit(c, req.user.id_usuario, estado === 'suspendido' ? 'suspender_usuario' : 'reactivar_usuario', 'usuario', id);
  });
  res.json({ id_usuario: id, estado });
}));

// HU-15 · Cola de moderación
router.get('/moderacion', ah(async (req, res) => {
  const [pub, neg, res_] = await Promise.all([
    query(`SELECT p.id_publicacion, p.tipo, p.titulo, p.municipio, p.creado_en, u.nombre AS anfitrion,
             (SELECT count(*) FROM imagen i WHERE i.id_publicacion = p.id_publicacion) AS num_imagenes
             FROM publicacion p JOIN usuario u ON u.id_usuario = p.id_anfitrion WHERE p.estado = 'pendiente' ORDER BY p.id_publicacion`),
    query("SELECT n.id_negocio, n.nombre, n.categoria, n.municipio, n.descripcion, u.nombre AS responsable FROM negocio_local n JOIN usuario u ON u.id_usuario = n.id_usuario WHERE n.estado = 'pendiente' ORDER BY n.id_negocio"),
    query(`SELECT r.id_resena, r.calificacion, r.comentario, p.titulo FROM resena r JOIN publicacion p ON p.id_publicacion = r.id_publicacion
             WHERE r.estado_moderacion = 'reportada' ORDER BY r.id_resena`),
  ]);
  res.json({ publicaciones: pub.rows, negocios: neg.rows, resenas: res_.rows });
}));

router.patch('/moderacion/:tipo/:id', ah(async (req, res) => {
  const tipo = v.oneOf(req.params.tipo, 'tipo', ['publicacion', 'negocio', 'resena']);
  const id = v.id(req.params.id);
  const accion = v.oneOf((req.body || {}).accion, 'accion', ['aprobar', 'rechazar', 'retirar']);
  const motivo = v.str((req.body || {}).motivo, 'Motivo', { max: 300, optional: true });
  if (accion !== 'aprobar' && !motivo) throw new HttpError(400, 'Debes indicar el motivo');

  const aviso = await tx(async (c) => {
    let correo = null; let titulo = '';
    if (tipo === 'publicacion') {
      const nuevo = accion === 'aprobar' ? 'publicada' : 'rechazada';
      const { rows } = await c.query(
        `UPDATE publicacion p SET estado = $2, motivo_rechazo = $3 FROM usuario u
          WHERE p.id_publicacion = $1 AND p.estado IN ('pendiente','publicada','pausada') AND u.id_usuario = p.id_anfitrion
          RETURNING u.correo, p.titulo`, [id, nuevo, accion === 'aprobar' ? null : motivo]);
      if (!rows[0]) throw new HttpError(404, 'Publicación no encontrada o no moderable');
      ({ correo, titulo } = rows[0]);
    } else if (tipo === 'negocio') {
      const nuevo = accion === 'aprobar' ? 'aprobado' : 'rechazado';
      const { rows } = await c.query(
        `UPDATE negocio_local n SET estado = $2, motivo_rechazo = $3 FROM usuario u WHERE n.id_negocio = $1 AND u.id_usuario = n.id_usuario RETURNING u.correo, n.nombre AS titulo`,
        [id, nuevo, accion === 'aprobar' ? null : motivo]);
      if (!rows[0]) throw new HttpError(404, 'Negocio no encontrado');
      ({ correo, titulo } = rows[0]);
    } else {
      const nuevo = accion === 'aprobar' ? 'aprobada' : 'retirada';
      const { rows } = await c.query('UPDATE resena SET estado_moderacion = $2 WHERE id_resena = $1 RETURNING id_publicacion', [id, nuevo]);
      if (!rows[0]) throw new HttpError(404, 'Reseña no encontrada');
      await recalcRating(c, rows[0].id_publicacion);
    }
    await audit(c, req.user.id_usuario, `moderar_${accion}`, tipo, id, motivo ? { motivo } : null);
    return correo ? { correo, titulo } : null;
  });
  if (aviso) {
    sendMail(aviso.correo, `Moderación de "${aviso.titulo}" - Eco Turismo`,
      accion === 'aprobar' ? 'Tu contenido fue aprobado y ya es visible.' : `Tu contenido no fue aprobado. Motivo: ${motivo}`);
  }
  res.json({ tipo, id, accion });
}));

// HU-16 · Reportes (JSON o CSV)
function csvCell(val) {
  if (val === null || val === undefined) return '';
  let s = val instanceof Date ? val.toISOString() : String(val);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita inyección de fórmulas en Excel
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows) {
  if (!rows.length) return '\uFEFF';
  const cols = Object.keys(rows[0]);
  return `\uFEFF${[cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n')}`;
}

router.get('/reportes', ah(async (req, res) => {
  const tipo = v.oneOf(req.query.tipo || 'reservas', 'tipo', ['reservas', 'ingresos', 'usuarios']);
  const hasta = req.query.hasta ? v.date(req.query.hasta, 'hasta') : today();
  const desde = req.query.desde ? v.date(req.query.desde, 'desde') : addDays(hasta, -30);
  const sqls = {
    reservas: `SELECT r.id_reserva, r.fecha_inicio, r.fecha_fin, r.estado, r.total, p.titulo AS publicacion, u.nombre AS turista, r.creado_en
                 FROM reserva r JOIN publicacion p ON p.id_publicacion = r.id_publicacion JOIN usuario u ON u.id_usuario = r.id_turista
                WHERE r.creado_en::date BETWEEN $1 AND $2 ORDER BY r.id_reserva`,
    ingresos: `SELECT fecha::date AS dia, count(*) AS pagos, sum(monto) AS monto, sum(comision) AS comision FROM pago
                WHERE estado = 'aprobado' AND fecha::date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1`,
    usuarios: `SELECT id_usuario, nombre, correo, rol, estado, creado_en FROM usuario WHERE creado_en::date BETWEEN $1 AND $2 ORDER BY id_usuario`,
  };
  const { rows } = await query(sqls[tipo], [desde, hasta]);
  if (req.query.formato === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="reporte_${tipo}_${desde}_${hasta}.csv"`);
    return res.send(toCsv(rows));
  }
  return res.json({ tipo, desde, hasta, filas: rows.length, datos: rows });
}));

router.get('/auditoria', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT a.id_log, a.accion, a.entidad, a.id_entidad, a.detalle, a.fecha, u.nombre AS admin
       FROM auditoria a JOIN usuario u ON u.id_usuario = a.id_admin ORDER BY a.id_log DESC LIMIT 100`,
  );
  res.json(rows);
}));

module.exports = router;
