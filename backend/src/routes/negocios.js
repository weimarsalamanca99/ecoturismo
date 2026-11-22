const express = require('express');
const { query, tx } = require('../db');
const { HttpError, ah } = require('../middleware/errors');
const { requireRole } = require('../middleware/auth');
const { upload, processImage } = require('../middleware/upload');
const v = require('../middleware/validate');

const router = express.Router();
const NEG = requireRole('negocio');

function parseBody(b) {
  return {
    nombre: v.str(b.nombre, 'Nombre', { min: 2, max: 120 }),
    categoria: v.str(b.categoria, 'Categoría', { min: 2, max: 60 }),
    descripcion: v.str(b.descripcion, 'Descripción', { min: 10, max: 2000 }),
    municipio: v.str(b.municipio, 'Municipio', { min: 2, max: 100 }),
    lat: v.num(b.lat, 'Latitud', { min: -90, max: 90 }),
    lng: v.num(b.lng, 'Longitud', { min: -180, max: 180 }),
    contacto: v.str(b.contacto, 'Contacto', { max: 160, optional: true }),
  };
}

// HU-17 · Registro de negocio local (queda pendiente de moderación)
router.post('/', NEG, ah(async (req, res) => {
  const n = parseBody(req.body || {});
  const { rows } = await query(
    `INSERT INTO negocio_local (id_usuario, nombre, categoria, descripcion, municipio, lat, lng, contacto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id_negocio, estado`,
    [req.user.id_usuario, n.nombre, n.categoria, n.descripcion, n.municipio, n.lat, n.lng, n.contacto],
  );
  res.status(201).json(rows[0]);
}));

router.get('/mios', NEG, ah(async (req, res) => {
  const { rows } = await query(
    `SELECT n.*, (SELECT i.id_imagen FROM imagen i WHERE i.id_negocio = n.id_negocio ORDER BY i.orden, i.id_imagen LIMIT 1) AS imagen_principal
       FROM negocio_local n WHERE n.id_usuario = $1 ORDER BY n.id_negocio DESC`,
    [req.user.id_usuario],
  );
  res.json(rows);
}));

// Listado público (solo aprobados)
router.get('/', ah(async (req, res) => {
  const params = [];
  let filtro = '';
  if (req.query.municipio) { params.push(`%${String(req.query.municipio).slice(0, 100).replace(/[%_\\]/g, '\\$&')}%`); filtro = `AND n.municipio ILIKE $${params.length}`; }
  const { rows } = await query(
    `SELECT n.id_negocio, n.nombre, n.categoria, n.descripcion, n.municipio, n.lat, n.lng, n.contacto,
            (SELECT i.id_imagen FROM imagen i WHERE i.id_negocio = n.id_negocio ORDER BY i.orden, i.id_imagen LIMIT 1) AS imagen_principal
       FROM negocio_local n WHERE n.estado = 'aprobado' ${filtro} ORDER BY n.nombre`,
    params,
  );
  res.json(rows);
}));

router.put('/:id', NEG, ah(async (req, res) => {
  const id = v.id(req.params.id);
  const n = parseBody(req.body || {});
  const { rowCount } = await query(
    `UPDATE negocio_local SET nombre=$3, categoria=$4, descripcion=$5, municipio=$6, lat=$7, lng=$8, contacto=$9, estado='pendiente', motivo_rechazo=NULL
      WHERE id_negocio=$1 AND id_usuario=$2`,
    [id, req.user.id_usuario, n.nombre, n.categoria, n.descripcion, n.municipio, n.lat, n.lng, n.contacto],
  );
  if (!rowCount) throw new HttpError(404, 'Negocio no encontrado');
  res.json({ mensaje: 'Negocio actualizado y enviado nuevamente a moderación' });
}));

router.post('/:id/imagenes', NEG, upload.array('imagenes', 5), ah(async (req, res) => {
  const id = v.id(req.params.id);
  if (!req.files || !req.files.length) throw new HttpError(400, 'Adjunta al menos una imagen en el campo "imagenes"');
  const ids = await tx(async (c) => {
    const own = await c.query('SELECT 1 FROM negocio_local WHERE id_negocio = $1 AND id_usuario = $2', [id, req.user.id_usuario]);
    if (!own.rows.length) throw new HttpError(404, 'Negocio no encontrado');
    const mx = await c.query('SELECT count(*) AS n, COALESCE(max(orden),0) AS mx FROM imagen WHERE id_negocio = $1', [id]);
    if (mx.rows[0].n + req.files.length > 8) throw new HttpError(400, 'Máximo 8 imágenes por negocio');
    let orden = mx.rows[0].mx;
    const out = [];
    for (const f of req.files) {
      orden += 1;
      const buf = await processImage(f.buffer);
      const r = await c.query('INSERT INTO imagen (id_negocio, contenido, mime, orden) VALUES ($1,$2,$3,$4) RETURNING id_imagen', [id, buf, 'image/webp', orden]);
      out.push(r.rows[0].id_imagen);
    }
    return out;
  });
  res.status(201).json({ imagenes: ids });
}));

module.exports = router;
