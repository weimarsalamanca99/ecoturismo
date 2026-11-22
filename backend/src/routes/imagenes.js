const express = require('express');
const { query } = require('../db');
const { HttpError, ah } = require('../middleware/errors');
const v = require('../middleware/validate');

const router = express.Router();

// Sirve una imagen almacenada en la base de datos (se cachea en el navegador y en CDN).
router.get('/:id', ah(async (req, res) => {
  const id = v.id(req.params.id);
  const { rows } = await query('SELECT contenido, mime FROM imagen WHERE id_imagen = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Imagen no encontrada');
  res.set('Content-Type', rows[0].mime);
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  res.send(rows[0].contenido);
}));

module.exports = router;
