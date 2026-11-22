// Prueba de concurrencia de reservas: muchos turistas intentan reservar el mismo cupo.
// Requiere un turista, una publicación publicada y disponibilidad. Ejemplo con los datos de demostración:
// k6 run -e BASE_URL=http://localhost:3000 -e PUB_ID=1 -e FECHA_INICIO=2026-12-10 -e FECHA_FIN=2026-12-12 load-tests/booking.js
import http from 'k6/http';
import { check } from 'k6';

export const options = { vus: 50, iterations: 50 };
const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  const r = http.post(`${BASE}/api/v1/auth/login`, JSON.stringify({ correo: 'turista@eco.test', password: 'Turista123!' }), { headers: { 'Content-Type': 'application/json' } });
  return { token: r.json('token') };
}

export default function (data) {
  const res = http.post(`${BASE}/api/v1/reservas`, JSON.stringify({
    id_publicacion: Number(__ENV.PUB_ID || 1),
    fecha_inicio: __ENV.FECHA_INICIO,
    fecha_fin: __ENV.FECHA_FIN,
    num_personas: 2,
  }), { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` } });
  // Solo una solicitud debe obtener 201; las demás deben recibir 409 (sin errores 500).
  check(res, { 'sin errores de servidor': (r) => r.status === 201 || r.status === 409 });
}
