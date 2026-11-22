/** Registra una acción administrativa (tabla de solo inserción). */
async function audit(client, idAdmin, accion, entidad, idEntidad, detalle = null) {
  await client.query(
    'INSERT INTO auditoria (id_admin, accion, entidad, id_entidad, detalle) VALUES ($1,$2,$3,$4,$5)',
    [idAdmin, accion, entidad, idEntidad, detalle ? JSON.stringify(detalle) : null],
  );
}
module.exports = { audit };
