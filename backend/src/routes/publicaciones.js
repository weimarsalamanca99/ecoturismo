const express = require('express');
const { query, tx } = require('../db');
const config = require('../config');
const { HttpError, ah } = require('../middleware/errors');
const { optionalAuth, requireRole } = require('../middleware/auth');
const { upload, processImage } = require('../middleware/upload');
const v = require('../middleware/validate');
const { today, addDays, daysBetween } = require('../utils/dates');

const router = express.Router();

function parseBody(b, tipo) {
  const base = {
    titulo: v.str(b.titulo, 'Título', { min: 5, max: 150 }),
    descripcion: v.str(b.descripcion, 'Descripción', { min: 20, max: 3000 }),
    municipio: v.str(b.municipio, 'Municipio', { min: 2, max: 100 }),
    precio_base: v.num(b.precio_base, 'Precio', { min: 1, max: 100000000 }),
    capacidad: v.int(b.capacidad, 'Capacidad', { min: 1, max: 500 }),
    lat: v.num(b.lat, 'Latitud', { min: -90, max: 90 }),
    lng: v.num(b.lng, 'Longitud', { min: -180, max: 180 }),
  };
  const det = tipo === 'alojamiento'
    ? { num_habitaciones: v.int(b.num_habitaciones, 'Habitaciones', { min: 1, max: 100 }), servicios: v.stringArray(b.servicios, 'Servicios', { max: 30 }) }
    : {
      duracion_horas: v.num(b.duracion_horas, 'Duración (horas)', { min: 0.5, max: 72 }),
      dificultad: v.oneOf(b.dificultad, 'Dificultad', ['baja', 'media', 'alta']),
      punto_encuentro: v.str(b.punto_encuentro, 'Punto de encuentro', { min: 3, max: 200 }),
    };
  return { base, det };
}

async function ownPublication(req, client = null) {
  const id = v.id(req.params.id);
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run("SELECT * FROM publicacion WHERE id_publicacion = $1 AND estado <> 'eliminada'", [id]);
  const p = rows[0];
  if (!p) throw new HttpError(404, 'Publicación no encontrada');
  if (p.id_anfitrion !== req.user.id_usuario) throw new HttpError(403, 'Esta publicación no te pertenece');
  return p;
}

const HOST = requireRole('anfitrion');

// HU-04 / HU-05 · Crear publicación (borrador)
router.post('/', HOST, ah(async (req, res) => {
  const b = req.body || {};
  const tipo = v.oneOf(b.tipo, 'Tipo', ['alojamiento', 'actividad']);
  const { base, det } = parseBody(b, tipo);
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO publicacion (id_anfitrion, tipo, titulo, descripcion, municipio, precio_base, capacidad, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id_publicacion`,
      [req.user.id_usuario, tipo, base.titulo, base.descripcion, base.municipio, base.precio_base, base.capacidad, base.lat, base.lng],
    );
    const idPub = rows[0].id_publicacion;
    if (tipo === 'alojamiento') {
      await c.query('INSERT INTO alojamiento (id_publicacion, num_habitaciones, servicios) VALUES ($1,$2,$3)', [idPub, det.num_habitaciones, det.servicios]);
    } else {
      await c.query('INSERT INTO actividad (id_publicacion, duracion_horas, dificultad, punto_encuentro) VALUES ($1,$2,$3,$4)', [idPub, det.duracion_horas, det.dificultad, det.punto_encuentro]);
    }
    return idPub;
  });
  res.status(201).json({ id_publicacion: id, estado: 'borrador' });
}));

// Publicaciones del anfitrión autenticado
router.get('/mias', HOST, ah(async (req, res) => {
  const { rows } = await query(
    `SELECT p.id_publicacion, p.tipo, p.titulo, p.municipio, p.precio_base, p.estado, p.motivo_rechazo, p.promedio, p.num_resenas,
            (SELECT count(*) FROM imagen i WHERE i.id_publicacion = p.id_publicacion) AS num_imagenes,
            (SELECT i.id_imagen FROM imagen i WHERE i.id_publicacion = p.id_publicacion ORDER BY i.orden, i.id_imagen LIMIT 1) AS imagen_principal
       FROM publicacion p WHERE p.id_anfitrion = $1 AND p.estado <> 'eliminada' ORDER BY p.id_publicacion DESC`,
    [req.user.id_usuario],
  );
  res.json(rows);
}));

// HU-07 / HU-08 · Búsqueda con filtros, paginación y cercanía
async function search(req, res) {
  const q = req.query;
  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };
  const where = ["p.estado = 'publicada'"];

  if (q.tipo) where.push(`p.tipo = ${add(v.oneOf(q.tipo, 'tipo', ['alojamiento', 'actividad']))}`);
  if (q.q) {
    const t = add(`%${String(q.q).slice(0, 100).replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(p.titulo ILIKE ${t} OR p.descripcion ILIKE ${t} OR p.municipio ILIKE ${t})`);
  }
  if (q.municipio) where.push(`p.municipio ILIKE ${add(`%${String(q.municipio).slice(0, 100).replace(/[%_\\]/g, '\\$&')}%`)}`);
  if (q.precio_min) where.push(`p.precio_base >= ${add(v.num(q.precio_min, 'precio_min', { min: 0 }))}`);
  if (q.precio_max) where.push(`p.precio_base <= ${add(v.num(q.precio_max, 'precio_max', { min: 0 }))}`);
  if (q.capacidad) where.push(`p.capacidad >= ${add(v.int(q.capacidad, 'capacidad', { min: 1 }))}`);
  if (q.calificacion_min) where.push(`p.promedio >= ${add(v.num(q.calificacion_min, 'calificacion_min', { min: 0, max: 5 }))}`);

  if (q.desde) {
    const desde = v.date(q.desde, 'desde');
    const hasta = q.hasta ? v.date(q.hasta, 'hasta') : addDays(desde, 1);
    const noches = daysBetween(desde, hasta);
    if (noches < 1 || noches > 60) throw new HttpError(400, 'El rango de fechas debe ser de 1 a 60 días');
    const personas = q.personas ? v.int(q.personas, 'personas', { min: 1, max: 500 }) : 1;
    const d = add(desde); const h = add(hasta); const pe = add(personas);
    where.push(`(SELECT count(*) FROM disponibilidad d WHERE d.id_publicacion = p.id_publicacion AND d.fecha >= ${d}::date AND d.fecha < ${h}::date
                  AND NOT d.bloqueado AND d.cupos_disponibles >= (CASE WHEN p.tipo = 'alojamiento' THEN 1 ELSE ${pe}::int END)) = ${noches}`);
  }

  let distExpr = null;
  if (q.lat !== undefined && q.lng !== undefined && q.lat !== '' && q.lng !== '') {
    const la = `${add(v.num(q.lat, 'lat', { min: -90, max: 90 }))}::float8`;
    const lo = `${add(v.num(q.lng, 'lng', { min: -180, max: 180 }))}::float8`;
    distExpr = `(6371 * acos(least(1, greatest(-1, cos(radians(${la})) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(${lo})) + sin(radians(${la})) * sin(radians(p.lat))))))`;
    const radio = q.radio_km ? v.num(q.radio_km, 'radio_km', { min: 1, max: 1000 }) : 50;
    where.push(`${distExpr} <= ${add(radio)}`);
  }

  const orders = {
    relevancia: 'p.promedio DESC, p.num_resenas DESC, p.id_publicacion DESC',
    precio_asc: 'p.precio_base ASC, p.id_publicacion DESC',
    precio_desc: 'p.precio_base DESC, p.id_publicacion DESC',
    calificacion: 'p.promedio DESC, p.num_resenas DESC',
    cercania: distExpr ? `${distExpr} ASC` : 'p.id_publicacion DESC',
  };
  const orden = q.orden ? v.oneOf(q.orden, 'orden', Object.keys(orders)) : (distExpr ? 'cercania' : 'relevancia');
  const limite = q.limite ? v.int(q.limite, 'limite', { min: 1, max: 50 }) : 12;
  const pagina = q.pagina ? v.int(q.pagina, 'pagina', { min: 1, max: 10000 }) : 1;

  const sql = `SELECT p.id_publicacion, p.tipo, p.titulo, p.municipio, p.precio_base, p.capacidad, p.lat, p.lng, p.promedio, p.num_resenas,
      (SELECT i.id_imagen FROM imagen i WHERE i.id_publicacion = p.id_publicacion ORDER BY i.orden, i.id_imagen LIMIT 1) AS imagen_principal
      ${distExpr ? `, round((${distExpr})::numeric, 1) AS distancia_km` : ''},
      count(*) OVER() AS total
    FROM publicacion p WHERE ${where.join(' AND ')}
    ORDER BY ${orders[orden]} LIMIT ${add(limite)} OFFSET ${add((pagina - 1) * limite)}`;
  const { rows } = await query(sql, params);
  const total = rows[0] ? rows[0].total : 0;
  res.json({ datos: rows.map(({ total: _t, ...r }) => r), total, pagina, limite });
}
router.get('/', ah(search));
router.get('/cercanas', ah(search));

// Detalle (público si está publicada; el dueño y el administrador pueden ver otros estados)
router.get('/:id', optionalAuth, ah(async (req, res) => {
  const id = v.id(req.params.id);
  const { rows } = await query(
    `SELECT p.*, u.nombre AS anfitrion_nombre, a.num_habitaciones, a.servicios, ac.duracion_horas, ac.dificultad, ac.punto_encuentro
       FROM publicacion p JOIN usuario u ON u.id_usuario = p.id_anfitrion
       LEFT JOIN alojamiento a ON a.id_publicacion = p.id_publicacion
       LEFT JOIN actividad ac ON ac.id_publicacion = p.id_publicacion
      WHERE p.id_publicacion = $1 AND p.estado <> 'eliminada'`,
    [id],
  );
  const p = rows[0];
  const privileged = req.user && (req.user.rol === 'administrador' || req.user.id_usuario === (p && p.id_anfitrion));
  if (!p || (p.estado !== 'publicada' && !privileged)) throw new HttpError(404, 'Publicación no encontrada');
  const imgs = await query('SELECT id_imagen FROM imagen WHERE id_publicacion = $1 ORDER BY orden, id_imagen', [id]);
  res.json({ ...p, imagenes: imgs.rows.map((i) => i.id_imagen) });
}));

// HU-06 · Editar
router.put('/:id', HOST, ah(async (req, res) => {
  const p = await ownPublication(req);
  const { base, det } = parseBody(req.body || {}, p.tipo);
  await tx(async (c) => {
    await c.query(
      `UPDATE publicacion SET titulo=$2, descripcion=$3, municipio=$4, precio_base=$5, capacidad=$6, lat=$7, lng=$8 WHERE id_publicacion=$1`,
      [p.id_publicacion, base.titulo, base.descripcion, base.municipio, base.precio_base, base.capacidad, base.lat, base.lng],
    );
    if (p.tipo === 'alojamiento') {
      await c.query('UPDATE alojamiento SET num_habitaciones=$2, servicios=$3 WHERE id_publicacion=$1', [p.id_publicacion, det.num_habitaciones, det.servicios]);
    } else {
      await c.query('UPDATE actividad SET duracion_horas=$2, dificultad=$3, punto_encuentro=$4 WHERE id_publicacion=$1', [p.id_publicacion, det.duracion_horas, det.dificultad, det.punto_encuentro]);
    }
  });
  res.json({ mensaje: 'Publicación actualizada' });
}));

// Enviar a moderación (requiere mínimo de imágenes)
router.post('/:id/enviar', HOST, ah(async (req, res) => {
  const p = await ownPublication(req);
  if (!['borrador', 'rechazada'].includes(p.estado)) throw new HttpError(409, 'Solo se pueden enviar borradores o publicaciones rechazadas');
  const { rows } = await query('SELECT count(*) AS n FROM imagen WHERE id_publicacion = $1', [p.id_publicacion]);
  if (rows[0].n < config.minImagenes) throw new HttpError(400, `Debes cargar al menos ${config.minImagenes} imágenes antes de enviar a moderación`);
  await query("UPDATE publicacion SET estado = 'pendiente', motivo_rechazo = NULL WHERE id_publicacion = $1", [p.id_publicacion]);
  res.json({ estado: 'pendiente' });
}));

router.post('/:id/pausar', HOST, ah(async (req, res) => {
  const p = await ownPublication(req);
  if (p.estado !== 'publicada') throw new HttpError(409, 'Solo se pueden pausar publicaciones publicadas');
  await query("UPDATE publicacion SET estado = 'pausada' WHERE id_publicacion = $1", [p.id_publicacion]);
  res.json({ estado: 'pausada' });
}));

router.post('/:id/reanudar', HOST, ah(async (req, res) => {
  const p = await ownPublication(req);
  if (p.estado !== 'pausada') throw new HttpError(409, 'Solo se pueden reanudar publicaciones pausadas');
  await query("UPDATE publicacion SET estado = 'publicada' WHERE id_publicacion = $1", [p.id_publicacion]);
  res.json({ estado: 'publicada' });
}));

// Eliminación lógica (bloqueada si hay reservas activas futuras)
router.delete('/:id', HOST, ah(async (req, res) => {
  const p = await ownPublication(req);
  const { rows } = await query(
    "SELECT 1 FROM reserva WHERE id_publicacion = $1 AND estado IN ('pendiente_pago','confirmada') AND fecha_fin >= $2 LIMIT 1",
    [p.id_publicacion, today()],
  );
  if (rows.length) throw new HttpError(409, 'No puedes eliminar una publicación con reservas activas');
  await query("UPDATE publicacion SET estado = 'eliminada' WHERE id_publicacion = $1", [p.id_publicacion]);
  res.status(204).end();
}));

// Imágenes
router.post('/:id/imagenes', HOST, upload.array('imagenes', 10), ah(async (req, res) => {
  const p = await ownPublication(req);
  if (!req.files || !req.files.length) throw new HttpError(400, 'Adjunta al menos una imagen en el campo "imagenes"');
  const { rows } = await query('SELECT count(*) AS n, COALESCE(max(orden), 0) AS mx FROM imagen WHERE id_publicacion = $1', [p.id_publicacion]);
  if (rows[0].n + req.files.length > 15) throw new HttpError(400, 'Máximo 15 imágenes por publicación');
  const ids = [];
  let orden = rows[0].mx;
  for (const f of req.files) {
    const buf = await processImage(f.buffer);
    orden += 1;
    const r = await query('INSERT INTO imagen (id_publicacion, contenido, mime, orden) VALUES ($1,$2,$3,$4) RETURNING id_imagen', [p.id_publicacion, buf, 'image/webp', orden]);
    ids.push(r.rows[0].id_imagen);
  }
  res.status(201).json({ imagenes: ids });
}));

router.delete('/:id/imagenes/:idImagen', HOST, ah(async (req, res) => {
  const p = await ownPublication(req);
  await query('DELETE FROM imagen WHERE id_imagen = $1 AND id_publicacion = $2', [v.id(req.params.idImagen, 'idImagen'), p.id_publicacion]);
  res.status(204).end();
}));

// HU-09 · Disponibilidad (calendario por día con cupos)
router.get('/:id/disponibilidad', ah(async (req, res) => {
  const id = v.id(req.params.id);
  let desde; let hasta;
  if (req.query.mes) {
    if (!/^\d{4}-\d{2}$/.test(String(req.query.mes))) throw new HttpError(400, 'mes debe tener formato AAAA-MM');
    desde = v.date(`${req.query.mes}-01`, 'mes');
    const [y, m] = req.query.mes.split('-').map(Number);
    hasta = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  } else {
    desde = req.query.desde ? v.date(req.query.desde, 'desde') : today();
    hasta = req.query.hasta ? v.date(req.query.hasta, 'hasta') : addDays(desde, 30);
  }
  if (daysBetween(desde, hasta) > 62) throw new HttpError(400, 'El rango máximo es de 62 días');
  const { rows } = await query(
    `SELECT d.fecha, d.cupos_totales, d.cupos_disponibles, d.bloqueado FROM disponibilidad d
       JOIN publicacion p ON p.id_publicacion = d.id_publicacion
      WHERE d.id_publicacion = $1 AND d.fecha >= $2 AND d.fecha < $3 AND p.estado <> 'eliminada' ORDER BY d.fecha`,
    [id, desde, hasta],
  );
  res.json(rows);
}));

router.put('/:id/disponibilidad', HOST, ah(async (req, res) => {
  const p = await ownPublication(req);
  const b = req.body || {};
  const desde = v.date(b.desde, 'desde');
  const hasta = v.date(b.hasta, 'hasta'); // inclusive
  const dias = daysBetween(desde, hasta) + 1;
  if (dias < 1 || dias > 366) throw new HttpError(400, 'El rango debe ser de 1 a 366 días');
  if (desde < today()) throw new HttpError(400, 'No se puede modificar la disponibilidad de fechas pasadas');
  const cupos = b.cupos_totales === undefined || b.cupos_totales === '' ? (p.tipo === 'alojamiento' ? 1 : p.capacidad) : v.int(b.cupos_totales, 'cupos_totales', { min: 0, max: 1000 });
  const bloqueado = v.bool(b.bloqueado, 'bloqueado', { optional: true }) || false;
  await query(
    `INSERT INTO disponibilidad (id_publicacion, fecha, cupos_totales, cupos_disponibles, bloqueado)
     SELECT $1, d::date, $4::int, $4::int, $5::boolean FROM generate_series($2::date, $3::date, interval '1 day') d
     ON CONFLICT (id_publicacion, fecha) DO UPDATE SET
       cupos_totales = EXCLUDED.cupos_totales,
       cupos_disponibles = GREATEST(0, EXCLUDED.cupos_totales - (disponibilidad.cupos_totales - disponibilidad.cupos_disponibles)),
       bloqueado = EXCLUDED.bloqueado`,
    [p.id_publicacion, desde, hasta, cupos, bloqueado],
  );
  res.json({ mensaje: `Disponibilidad actualizada para ${dias} día(s)` });
}));

// HU-13 · Reseñas de una publicación
router.get('/:id/resenas', ah(async (req, res) => {
  const id = v.id(req.params.id);
  const { rows } = await query(
    `SELECT r.id_resena, r.calificacion, r.comentario, r.fecha, split_part(u.nombre, ' ', 1) AS autor
       FROM resena r JOIN usuario u ON u.id_usuario = r.id_turista
      WHERE r.id_publicacion = $1 AND r.estado_moderacion = 'aprobada' ORDER BY r.fecha DESC LIMIT 50`,
    [id],
  );
  res.json(rows);
}));

module.exports = router;
