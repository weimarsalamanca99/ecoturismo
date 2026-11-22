// Datos de demostración (usuarios, publicaciones con imágenes generadas, disponibilidad y una reserva pasada para probar reseñas).
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const config = require('./config');
const { pool } = require('./db');
const { migrate } = require('./migrate');
const { today, addDays } = require('./utils/dates');

const USERS = [
  ['Administrador Eco', 'admin@eco.test', 'Admin123!', 'administrador'],
  ['Laura Anfitriona', 'anfitrion@eco.test', 'Host123!', 'anfitrion'],
  ['Carlos Turista', 'turista@eco.test', 'Turista123!', 'turista'],
  ['Artesanías Zipa', 'negocio@eco.test', 'Negocio123!', 'negocio'],
];

const PUBS = [
  ['alojamiento', 'Finca El Roble', 'Finca campesina con vista a la sabana, desayuno típico, senderos y fogata para disfrutar en familia.', 'Zipaquirá', 180000, 6, 5.0225, -74.0045, { num_habitaciones: 3, servicios: ['Wi-Fi', 'Desayuno', 'Parqueadero', 'Fogata'] }],
  ['alojamiento', 'Cabañas del Páramo', 'Cabañas de madera cerca de la laguna, ideales para desconectarse y observar aves al amanecer.', 'Guatavita', 220000, 4, 4.9347, -73.8333, { num_habitaciones: 2, servicios: ['Chimenea', 'Cocina', 'Parqueadero'] }],
  ['alojamiento', 'Glamping Laguna Verde', 'Domos con cama doble, baño privado y vista a la laguna. Incluye caminata guiada de bienvenida.', 'Suesca', 260000, 2, 5.1031, -73.7981, { num_habitaciones: 1, servicios: ['Desayuno', 'Baño privado', 'Jacuzzi'] }],
  ['actividad', 'Caminata Páramo Verde', 'Recorrido guiado de 5 horas por el páramo con interpretación ambiental, hidratación y refrigerio.', 'Guasca', 65000, 12, 4.8667, -73.8667, { duracion_horas: 5, dificultad: 'media', punto_encuentro: 'Parque principal de Guasca' }],
  ['actividad', 'Avistamiento de aves', 'Amanecer de observación de aves con guía local, binoculares y café de la región.', 'Villa de Leyva', 80000, 8, 5.6333, -73.5333, { duracion_horas: 4, dificultad: 'baja', punto_encuentro: 'Entrada al santuario de flora y fauna' }],
  ['actividad', 'Escalada en Suesca', 'Iniciación a la escalada en roca con instructores certificados y todo el equipo de seguridad.', 'Suesca', 95000, 6, 5.1, -73.8, { duracion_horas: 6, dificultad: 'alta', punto_encuentro: 'Estación del tren de Suesca' }],
];

async function colorImage(h, variant) {
  const c1 = `hsl(${h}, 55%, 45%)`;
  const c2 = `hsl(${(h + 40) % 360}, 60%, 70%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs>
    <rect width="1200" height="800" fill="url(#g)"/>
    <circle cx="${900 - variant * 150}" cy="170" r="90" fill="#FFF3C4" opacity="0.9"/>
    <path d="M0 620 Q 300 ${420 + variant * 30} 600 600 T 1200 560 V800 H0Z" fill="hsl(${h},45%,28%)"/>
    <path d="M0 700 Q 400 ${560 + variant * 20} 800 690 T 1200 680 V800 H0Z" fill="hsl(${h},40%,20%)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 75 }).toBuffer();
}

async function seed() {
  await migrate();
  const exists = await pool.query("SELECT 1 FROM usuario WHERE correo = 'admin@eco.test'");
  if (exists.rows.length) { console.log('Seed: los datos de demostración ya existen.'); return; }
  console.log('Seed: creando datos de demostración...');
  const ids = {};
  for (const [nombre, correo, pass, rol] of USERS) {
    const hash = await bcrypt.hash(pass, config.bcryptRounds);
    const r = await pool.query(
      'INSERT INTO usuario (nombre, correo, password_hash, rol, acepta_datos, correo_verificado) VALUES ($1,$2,$3,$4,true,true) RETURNING id_usuario',
      [nombre, correo, hash, rol],
    );
    ids[rol] = r.rows[0].id_usuario;
  }
  const pubIds = [];
  for (let i = 0; i < PUBS.length; i += 1) {
    const [tipo, titulo, descripcion, municipio, precio, cap, lat, lng, det] = PUBS[i];
    const r = await pool.query(
      `INSERT INTO publicacion (id_anfitrion, tipo, titulo, descripcion, municipio, precio_base, capacidad, lat, lng, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'publicada') RETURNING id_publicacion`,
      [ids.anfitrion, tipo, titulo, descripcion, municipio, precio, cap, lat, lng],
    );
    const id = r.rows[0].id_publicacion;
    pubIds.push(id);
    if (tipo === 'alojamiento') {
      await pool.query('INSERT INTO alojamiento VALUES ($1,$2,$3)', [id, det.num_habitaciones, det.servicios]);
    } else {
      await pool.query('INSERT INTO actividad VALUES ($1,$2,$3,$4)', [id, det.duracion_horas, det.dificultad, det.punto_encuentro]);
    }
    for (let k = 0; k < 3; k += 1) {
      await pool.query('INSERT INTO imagen (id_publicacion, contenido, mime, orden) VALUES ($1,$2,$3,$4)', [id, await colorImage((i * 55 + k * 12) % 360, k), 'image/webp', k + 1]);
    }
    const cupos = tipo === 'alojamiento' ? 1 : cap;
    await pool.query(
      `INSERT INTO disponibilidad (id_publicacion, fecha, cupos_totales, cupos_disponibles, bloqueado)
       SELECT $1, d::date, $4::int, $4::int, false FROM generate_series($2::date, $3::date, interval '1 day') d`,
      [id, addDays(today(), -10), addDays(today(), 120), cupos],
    );
  }
  // Reserva pasada y pagada del turista en la primera publicación (permite probar la reseña).
  const rs = await pool.query(
    `INSERT INTO reserva (id_turista, id_publicacion, fecha_inicio, fecha_fin, num_personas, cupos_usados, total, estado)
     VALUES ($1,$2,$3,$4,2,1,360000,'confirmada') RETURNING id_reserva`,
    [ids.turista, pubIds[0], addDays(today(), -5), addDays(today(), -3)],
  );
  await pool.query("INSERT INTO pago (id_reserva, monto, comision, estado, referencia) VALUES ($1,360000,36000,'aprobado','SIM-DEMO')", [rs.rows[0].id_reserva]);
  // Negocio local aprobado con imagen.
  const nl = await pool.query(
    `INSERT INTO negocio_local (id_usuario, nombre, categoria, descripcion, municipio, lat, lng, contacto, estado)
     VALUES ($1,'Artesanías Zipa','Artesanías','Tejidos, cerámica y recuerdos hechos a mano por artesanos de la región.','Zipaquirá',5.0233,-74.0030,'+57 300 000 0000','aprobado') RETURNING id_negocio`,
    [ids.negocio],
  );
  await pool.query('INSERT INTO imagen (id_negocio, contenido, mime, orden) VALUES ($1,$2,$3,1)', [nl.rows[0].id_negocio, await colorImage(25, 1), 'image/webp']);
  console.log('Seed: listo. Usuarios de demostración: admin@eco.test / Admin123!, anfitrion@eco.test / Host123!, turista@eco.test / Turista123!, negocio@eco.test / Negocio123!');
}

module.exports = { seed };
