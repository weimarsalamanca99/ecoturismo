// Pruebas de integración de la API. Requieren PostgreSQL (variable DATABASE_URL).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { today, addDays } = require('../src/utils/dates');
const { releaseExpired } = require('../src/services/scheduler');

const CARD_OK = { numero: '4111111111111111', vence: '12/40', cvv: '123' };
const CARD_RECHAZADA = { numero: '4000000000000002', vence: '12/40', cvv: '123' };

let admin; let host; let host2; let turista; let turista2;
let pubId;

const pubBody = (extra = {}) => ({
  tipo: 'alojamiento', titulo: 'Finca de prueba', descripcion: 'Finca de prueba con descripción suficientemente larga.', municipio: 'Zipaquirá',
  precio_base: 150000, capacidad: 4, lat: 5.0225, lng: -74.0045, num_habitaciones: 2, servicios: ['Wi-Fi'], ...extra,
});

before(async () => {
  await h.start();
  admin = await h.createAdmin();
  host = await h.register('host@test.co', 'anfitrion', 'Anfitriona Uno');
  host2 = await h.register('host2@test.co', 'anfitrion', 'Anfitrion Dos');
  turista = await h.register('turista@test.co', 'turista', 'Turista Uno');
  turista2 = await h.register('turista2@test.co', 'turista', 'Turista Dos');
});
after(async () => { await h.stop(); });

describe('Autenticación (HU-01, HU-02)', () => {
  it('rechaza registro duplicado, contraseña débil y falta de consentimiento', async () => {
    const dup = await h.call('POST', '/auth/registro', { body: { nombre: 'Otro', correo: 'host@test.co', password: 'Prueba123', rol: 'turista', acepta_datos: true } });
    assert.equal(dup.status, 409);
    const weak = await h.call('POST', '/auth/registro', { body: { nombre: 'Otro', correo: 'x@test.co', password: 'abc', rol: 'turista', acepta_datos: true } });
    assert.equal(weak.status, 400);
    const noConsent = await h.call('POST', '/auth/registro', { body: { nombre: 'Otro', correo: 'y@test.co', password: 'Prueba123', rol: 'turista' } });
    assert.equal(noConsent.status, 400);
  });
  it('no permite registrarse como administrador', async () => {
    const r = await h.call('POST', '/auth/registro', { body: { nombre: 'Intruso', correo: 'z@test.co', password: 'Prueba123', rol: 'administrador', acepta_datos: true } });
    assert.equal(r.status, 400);
  });
  it('credenciales inválidas dan 401 genérico y 5 fallos bloquean temporalmente', async () => {
    await h.register('bloq@test.co', 'turista');
    for (let i = 0; i < 5; i += 1) {
      const r = await h.call('POST', '/auth/login', { body: { correo: 'bloq@test.co', password: 'Incorrecta1' } });
      assert.equal(r.status, 401);
    }
    const locked = await h.call('POST', '/auth/login', { body: { correo: 'bloq@test.co', password: 'Prueba123' } });
    assert.equal(locked.status, 429);
    const noUser = await h.call('POST', '/auth/login', { body: { correo: 'noexiste@test.co', password: 'Prueba123' } });
    assert.equal(noUser.status, 401);
  });
  it('rechaza tokens inválidos', async () => {
    const r = await h.call('GET', '/usuarios/me', { token: 'token-falso' });
    assert.equal(r.status, 401);
  });
  it('perfil: consulta y actualización', async () => {
    const me = await h.call('GET', '/usuarios/me', { token: turista.token });
    assert.equal(me.body.correo, 'turista@test.co');
    const up = await h.call('PUT', '/usuarios/me', { token: turista.token, body: { nombre: 'Turista Actualizado', telefono: '3001112233' } });
    assert.equal(up.body.nombre, 'Turista Actualizado');
  });
});

describe('Publicaciones (HU-04, HU-05, HU-06, HU-15)', () => {
  it('un turista no puede crear publicaciones', async () => {
    const r = await h.call('POST', '/publicaciones', { token: turista.token, body: pubBody() });
    assert.equal(r.status, 403);
  });
  it('valida los datos de la publicación', async () => {
    const r = await h.call('POST', '/publicaciones', { token: host.token, body: pubBody({ precio_base: -5 }) });
    assert.equal(r.status, 400);
  });
  it('crea borrador, exige imágenes y la envía a moderación', async () => {
    const c = await h.call('POST', '/publicaciones', { token: host.token, body: pubBody() });
    assert.equal(c.status, 201);
    pubId = c.body.id_publicacion;
    const sinImgs = await h.call('POST', `/publicaciones/${pubId}/enviar`, { token: host.token });
    assert.equal(sinImgs.status, 400);
    const up = await h.call('POST', `/publicaciones/${pubId}/imagenes`, { token: host.token, form: await h.imageForm(3) });
    assert.equal(up.status, 201);
    assert.equal(up.body.imagenes.length, 3);
    const env = await h.call('POST', `/publicaciones/${pubId}/enviar`, { token: host.token });
    assert.equal(env.body.estado, 'pendiente');
  });
  it('no es visible hasta que el administrador la aprueba', async () => {
    const antes = await h.call('GET', '/publicaciones');
    assert.equal(antes.body.total, 0);
    const detalleAnonimo = await h.call('GET', `/publicaciones/${pubId}`);
    assert.equal(detalleAnonimo.status, 404);
    const noAdmin = await h.call('PATCH', `/admin/moderacion/publicacion/${pubId}`, { token: host.token, body: { accion: 'aprobar' } });
    assert.equal(noAdmin.status, 403);
    const ok = await h.call('PATCH', `/admin/moderacion/publicacion/${pubId}`, { token: admin.token, body: { accion: 'aprobar' } });
    assert.equal(ok.status, 200);
    const despues = await h.call('GET', '/publicaciones');
    assert.equal(despues.body.total, 1);
    assert.ok(despues.body.datos[0].imagen_principal);
  });
  it('otro anfitrión no puede modificarla', async () => {
    const r = await h.call('PUT', `/publicaciones/${pubId}`, { token: host2.token, body: pubBody() });
    assert.equal(r.status, 403);
    const d = await h.call('PUT', `/publicaciones/${pubId}/disponibilidad`, { token: host2.token, body: { desde: addDays(today(), 1), hasta: addDays(today(), 2) } });
    assert.equal(d.status, 403);
  });
  it('el dueño la edita y el detalle incluye sus imágenes', async () => {
    const e = await h.call('PUT', `/publicaciones/${pubId}`, { token: host.token, body: pubBody({ titulo: 'Finca editada de prueba' }) });
    assert.equal(e.status, 200);
    const det = await h.call('GET', `/publicaciones/${pubId}`);
    assert.equal(det.body.titulo, 'Finca editada de prueba');
    assert.equal(det.body.imagenes.length, 3);
  });
  it('disponibilidad: define y consulta el calendario (HU-09)', async () => {
    const r = await h.call('PUT', `/publicaciones/${pubId}/disponibilidad`, { token: host.token, body: { desde: addDays(today(), 1), hasta: addDays(today(), 60), cupos_totales: 1 } });
    assert.equal(r.status, 200);
    const g = await h.call('GET', `/publicaciones/${pubId}/disponibilidad?desde=${addDays(today(), 1)}&hasta=${addDays(today(), 4)}`);
    assert.equal(g.body.length, 3);
    const pasado = await h.call('PUT', `/publicaciones/${pubId}/disponibilidad`, { token: host.token, body: { desde: addDays(today(), -3), hasta: addDays(today(), -1) } });
    assert.equal(pasado.status, 400);
  });
});

describe('Búsqueda (HU-07, HU-08)', () => {
  it('filtra por precio, texto, fechas y cercanía', async () => {
    assert.equal((await h.call('GET', '/publicaciones?precio_max=100000')).body.total, 0);
    assert.equal((await h.call('GET', '/publicaciones?precio_max=200000&tipo=alojamiento')).body.total, 1);
    assert.equal((await h.call('GET', '/publicaciones?q=zipaquir')).body.total, 1);
    assert.equal((await h.call('GET', `/publicaciones?desde=${addDays(today(), 5)}&hasta=${addDays(today(), 7)}`)).body.total, 1);
    assert.equal((await h.call('GET', `/publicaciones?desde=${addDays(today(), 80)}&hasta=${addDays(today(), 82)}`)).body.total, 0);
    const cerca = await h.call('GET', '/publicaciones/cercanas?lat=5.02&lng=-74.0&radio_km=10');
    assert.equal(cerca.body.total, 1);
    assert.ok(cerca.body.datos[0].distancia_km < 5);
    assert.equal((await h.call('GET', '/publicaciones/cercanas?lat=4.6&lng=-74.08&radio_km=10')).body.total, 0);
  });
  it('resiste intentos de inyección SQL en el texto de búsqueda', async () => {
    const r = await h.call('GET', `/publicaciones?q=${encodeURIComponent("'; DROP TABLE usuario; --")}`);
    assert.equal(r.status, 200);
    const u = await h.query('SELECT count(*)::int AS n FROM usuario');
    assert.ok(u.rows[0].n > 0);
  });
  it('rechaza parámetros inválidos', async () => {
    assert.equal((await h.call('GET', '/publicaciones?orden=hack')).status, 400);
    assert.equal((await h.call('GET', '/publicaciones?desde=hoy')).status, 400);
  });
});

describe('Reservas (HU-10, HU-11, HU-18)', () => {
  let reservaId;
  const ini = addDays(today(), 5);
  const fin = addDays(today(), 7);

  it('crea una reserva pendiente de pago y consume el cupo', async () => {
    const r = await h.call('POST', '/reservas', { token: turista.token, body: { id_publicacion: pubId, fecha_inicio: ini, fecha_fin: fin, num_personas: 2 } });
    assert.equal(r.status, 201);
    assert.equal(r.body.estado, 'pendiente_pago');
    assert.equal(r.body.total, 300000);
    reservaId = r.body.id_reserva;
    const otra = await h.call('POST', '/reservas', { token: turista2.token, body: { id_publicacion: pubId, fecha_inicio: ini, fecha_fin: fin, num_personas: 2 } });
    assert.equal(otra.status, 409);
  });
  it('un anfitrión no reserva y el turista no reserva en el pasado', async () => {
    assert.equal((await h.call('POST', '/reservas', { token: host.token, body: { id_publicacion: pubId, fecha_inicio: ini, fecha_fin: fin, num_personas: 1 } })).status, 403);
    assert.equal((await h.call('POST', '/reservas', { token: turista.token, body: { id_publicacion: pubId, fecha_inicio: addDays(today(), -2), fecha_fin: today(), num_personas: 1 } })).status, 400);
    assert.equal((await h.call('POST', '/reservas', { token: turista.token, body: { id_publicacion: pubId, fecha_inicio: addDays(today(), 20), fecha_fin: addDays(today(), 21), num_personas: 99 } })).status, 400);
  });
  it('cancelar libera los cupos', async () => {
    const c = await h.call('POST', `/reservas/${reservaId}/cancelar`, { token: turista.token });
    assert.equal(c.status, 200);
    const again = await h.call('POST', '/reservas', { token: turista2.token, body: { id_publicacion: pubId, fecha_inicio: ini, fecha_fin: fin, num_personas: 2 } });
    assert.equal(again.status, 201);
    await h.call('POST', `/reservas/${again.body.id_reserva}/cancelar`, { token: turista2.token });
  });
  it('control de concurrencia: 30 solicitudes simultáneas por el mismo cupo generan una sola reserva', async () => {
    const i2 = addDays(today(), 20);
    const f2 = addDays(today(), 22);
    const tokens = [turista.token, turista2.token];
    const results = await Promise.all(Array.from({ length: 30 }, (_, k) =>
      h.call('POST', '/reservas', { token: tokens[k % 2], body: { id_publicacion: pubId, fecha_inicio: i2, fecha_fin: f2, num_personas: 2 } })));
    const exitosas = results.filter((r) => r.status === 201);
    assert.equal(exitosas.length, 1, `esperaba 1 reserva y hubo ${exitosas.length}`);
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409));
    const disp = await h.query('SELECT cupos_disponibles FROM disponibilidad WHERE id_publicacion = $1 AND fecha = $2', [pubId, i2]);
    assert.equal(disp.rows[0].cupos_disponibles, 0);
    await h.call('POST', `/reservas/${exitosas[0].body.id_reserva}/cancelar`, { token: exitosas[0].body.id_turista === turista.id ? turista.token : turista2.token });
  });
  it('las reservas vencidas liberan el cupo', async () => {
    const i3 = addDays(today(), 30);
    const f3 = addDays(today(), 31);
    const r = await h.call('POST', '/reservas', { token: turista.token, body: { id_publicacion: pubId, fecha_inicio: i3, fecha_fin: f3, num_personas: 1 } });
    assert.equal(r.status, 201);
    await h.query("UPDATE reserva SET expira_en = now() - interval '1 minute' WHERE id_reserva = $1", [r.body.id_reserva]);
    assert.ok((await releaseExpired()) >= 1);
    const est = await h.query('SELECT estado FROM reserva WHERE id_reserva = $1', [r.body.id_reserva]);
    assert.equal(est.rows[0].estado, 'expirada');
    const d = await h.query('SELECT cupos_disponibles FROM disponibilidad WHERE id_publicacion = $1 AND fecha = $2', [pubId, i3]);
    assert.equal(d.rows[0].cupos_disponibles, 1);
  });
});

describe('Pagos y cancelación con reembolso (HU-12, HU-18)', () => {
  let reservaId;
  it('un pago rechazado no confirma la reserva y uno aprobado sí, con comisión del 10 %', async () => {
    const r = await h.call('POST', '/reservas', { token: turista.token, body: { id_publicacion: pubId, fecha_inicio: addDays(today(), 40), fecha_fin: addDays(today(), 42), num_personas: 2 } });
    reservaId = r.body.id_reserva;
    const mal = await h.call('POST', '/pagos', { token: turista.token, body: { id_reserva: reservaId, tarjeta: CARD_RECHAZADA } });
    assert.equal(mal.status, 402);
    assert.equal((await h.call('GET', `/reservas/${reservaId}`, { token: turista.token })).body.estado, 'pendiente_pago');
    const invalida = await h.call('POST', '/pagos', { token: turista.token, body: { id_reserva: reservaId, tarjeta: { numero: '1234', vence: '12/40', cvv: '123' } } });
    assert.equal(invalida.status, 400);
    const ok = await h.call('POST', '/pagos', { token: turista.token, body: { id_reserva: reservaId, tarjeta: CARD_OK } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.estado, 'aprobado');
    assert.equal(ok.body.comision, 30000);
    const det = await h.call('GET', `/reservas/${reservaId}`, { token: turista.token });
    assert.equal(det.body.estado, 'confirmada');
    const doble = await h.call('POST', '/pagos', { token: turista.token, body: { id_reserva: reservaId, tarjeta: CARD_OK } });
    assert.equal(doble.status, 409);
  });
  it('solo el turista dueño y el anfitrión ven la reserva; el anfitrión ve el contacto', async () => {
    assert.equal((await h.call('GET', `/reservas/${reservaId}`, { token: turista2.token })).status, 404);
    assert.equal((await h.call('POST', '/pagos', { token: turista2.token, body: { id_reserva: reservaId, tarjeta: CARD_OK } })).status, 404);
    const rec = await h.call('GET', '/reservas/recibidas', { token: host.token });
    const mia = rec.body.find((x) => x.id_reserva === reservaId);
    assert.equal(mia.turista_correo, 'turista@test.co');
  });
  it('cancelar con más de 48 horas de anticipación reembolsa el pago', async () => {
    const c = await h.call('POST', `/reservas/${reservaId}/cancelar`, { token: turista.token });
    assert.equal(c.body.reembolso, true);
    assert.equal(c.body.monto_reembolsado, 300000);
    const p = await h.query('SELECT estado FROM pago WHERE id_reserva = $1 ORDER BY id_pago DESC LIMIT 1', [reservaId]);
    assert.equal(p.rows[0].estado, 'reembolsado');
  });
  it('cancelar con menos de 48 horas no reembolsa', async () => {
    const r = await h.call('POST', '/reservas', { token: turista.token, body: { id_publicacion: pubId, fecha_inicio: addDays(today(), 1), fecha_fin: addDays(today(), 2), num_personas: 1 } });
    await h.call('POST', '/pagos', { token: turista.token, body: { id_reserva: r.body.id_reserva, tarjeta: CARD_OK } });
    const c = await h.call('POST', `/reservas/${r.body.id_reserva}/cancelar`, { token: turista.token });
    assert.equal(c.body.reembolso, false);
  });
});

describe('Reseñas (HU-13)', () => {
  let reservaId;
  it('solo se puede reseñar una reserva confirmada que ya terminó, una vez', async () => {
    const r = await h.call('POST', '/reservas', { token: turista.token, body: { id_publicacion: pubId, fecha_inicio: addDays(today(), 50), fecha_fin: addDays(today(), 52), num_personas: 1 } });
    reservaId = r.body.id_reserva;
    await h.call('POST', '/pagos', { token: turista.token, body: { id_reserva: reservaId, tarjeta: CARD_OK } });
    const temprano = await h.call('POST', '/resenas', { token: turista.token, body: { id_reserva: reservaId, calificacion: 5, comentario: 'Excelente' } });
    assert.equal(temprano.status, 409);
    await h.query('UPDATE reserva SET fecha_inicio = $2, fecha_fin = $3 WHERE id_reserva = $1', [reservaId, addDays(today(), -4), addDays(today(), -2)]);
    assert.equal((await h.call('POST', '/resenas', { token: turista.token, body: { id_reserva: reservaId, calificacion: 7 } })).status, 400);
    assert.equal((await h.call('POST', '/resenas', { token: turista2.token, body: { id_reserva: reservaId, calificacion: 5 } })).status, 404);
    const ok = await h.call('POST', '/resenas', { token: turista.token, body: { id_reserva: reservaId, calificacion: 5, comentario: 'Excelente lugar' } });
    assert.equal(ok.status, 201);
    assert.equal((await h.call('POST', '/resenas', { token: turista.token, body: { id_reserva: reservaId, calificacion: 4 } })).status, 409);
  });
  it('actualiza el promedio y permite reportar y moderar', async () => {
    const det = await h.call('GET', `/publicaciones/${pubId}`);
    assert.equal(det.body.promedio, 5);
    assert.equal(det.body.num_resenas, 1);
    const lista = await h.call('GET', `/publicaciones/${pubId}/resenas`);
    assert.equal(lista.body.length, 1);
    const rep = await h.call('POST', `/resenas/${lista.body[0].id_resena}/reportar`, { token: turista2.token });
    assert.equal(rep.status, 200);
    const cola = await h.call('GET', '/admin/moderacion', { token: admin.token });
    assert.equal(cola.body.resenas.length, 1);
    const ret = await h.call('PATCH', `/admin/moderacion/resena/${lista.body[0].id_resena}`, { token: admin.token, body: { accion: 'retirar', motivo: 'Contenido inapropiado' } });
    assert.equal(ret.status, 200);
    assert.equal((await h.call('GET', `/publicaciones/${pubId}`)).body.num_resenas, 0);
  });
});

describe('Negocios locales (HU-17)', () => {
  it('el negocio se registra, el administrador lo aprueba y aparece en el listado público', async () => {
    const neg = await h.register('negocio@test.co', 'negocio', 'Dueña Negocio');
    const c = await h.call('POST', '/negocios', { token: neg.token, body: { nombre: 'Artesanías Zipa', categoria: 'Artesanías', descripcion: 'Tejidos y cerámica local', municipio: 'Zipaquirá', lat: 5.02, lng: -74.0 } });
    assert.equal(c.status, 201);
    assert.equal((await h.call('GET', '/negocios')).body.length, 0);
    assert.equal((await h.call('PATCH', `/admin/moderacion/negocio/${c.body.id_negocio}`, { token: admin.token, body: { accion: 'aprobar' } })).status, 200);
    assert.equal((await h.call('GET', '/negocios')).body.length, 1);
    assert.equal((await h.call('POST', '/negocios', { token: turista.token, body: {} })).status, 403);
  });
});

describe('Administración (HU-14, HU-16) y seguridad', () => {
  it('solo el administrador accede al panel', async () => {
    assert.equal((await h.call('GET', '/admin/resumen', { token: turista.token })).status, 403);
    assert.equal((await h.call('GET', '/admin/resumen')).status, 401);
    const r = await h.call('GET', '/admin/resumen', { token: admin.token });
    assert.equal(r.status, 200);
    assert.ok(r.body.usuarios_activos >= 5);
  });
  it('genera reportes en JSON y CSV', async () => {
    const j = await h.call('GET', '/admin/reportes?tipo=reservas', { token: admin.token });
    assert.equal(j.status, 200);
    assert.ok(j.body.filas >= 1);
    const csv = await h.call('GET', '/admin/reportes?tipo=ingresos&formato=csv', { token: admin.token });
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    const inv = await h.call('GET', '/admin/reportes?tipo=otro', { token: admin.token });
    assert.equal(inv.status, 400);
  });
  it('suspender a un usuario bloquea su acceso y queda auditado', async () => {
    const s = await h.call('PATCH', `/admin/usuarios/${turista2.id}/estado`, { token: admin.token, body: { estado: 'suspendido' } });
    assert.equal(s.status, 200);
    assert.equal((await h.call('GET', '/usuarios/me', { token: turista2.token })).status, 403);
    assert.equal((await h.call('POST', '/auth/login', { body: { correo: 'turista2@test.co', password: 'Prueba123' } })).status, 403);
    const log = await h.call('GET', '/admin/auditoria', { token: admin.token });
    assert.ok(log.body.some((x) => x.accion === 'suspender_usuario'));
    await assert.rejects(h.query('DELETE FROM auditoria'), /solo inserción/);
  });
  it('envía cabeceras de seguridad y oculta la tecnología del servidor', async () => {
    const r = await h.call('GET', '/health');
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('content-security-policy'));
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });
  it('el usuario puede eliminar su cuenta (anonimización)', async () => {
    const u = await h.register('borrar@test.co', 'turista');
    assert.equal((await h.call('DELETE', '/usuarios/me', { token: u.token })).status, 204);
    assert.equal((await h.call('POST', '/auth/login', { body: { correo: 'borrar@test.co', password: 'Prueba123' } })).status, 401);
  });
});
