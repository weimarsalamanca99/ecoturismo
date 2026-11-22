/** Recalcula el promedio y el número de reseñas aprobadas de una publicación. */
async function recalcRating(client, idPublicacion) {
  await client.query(
    `UPDATE publicacion p SET
       promedio = COALESCE((SELECT round(avg(calificacion)::numeric, 2) FROM resena r WHERE r.id_publicacion = p.id_publicacion AND r.estado_moderacion = 'aprobada'), 0),
       num_resenas = (SELECT count(*) FROM resena r WHERE r.id_publicacion = p.id_publicacion AND r.estado_moderacion = 'aprobada')
     WHERE p.id_publicacion = $1`,
    [idPublicacion],
  );
}
module.exports = { recalcRating };
