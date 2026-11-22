const multer = require('multer');
const sharp = require('sharp');
const { HttpError } = require('./errors');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    return cb(new HttpError(400, 'Solo se permiten imágenes JPG, PNG o WebP'));
  },
});

/** Re-procesa la imagen (valida que sea una imagen real, quita metadatos, limita tamaño y convierte a WebP). */
async function processImage(buffer) {
  try {
    return await sharp(buffer).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch (_) {
    throw new HttpError(400, 'El archivo no es una imagen válida');
  }
}

module.exports = { upload, processImage };
