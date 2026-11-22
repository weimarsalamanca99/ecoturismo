// Prueba de carga de la búsqueda (RNF-03 y RNF-06): 500 usuarios virtuales, percentil 95 menor a 3 s.
// Uso: k6 run -e BASE_URL=http://localhost:3000 load-tests/search.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const res = http.get(`${BASE}/api/v1/publicaciones?tipo=alojamiento&precio_max=300000&orden=precio_asc`);
  check(res, { 'status 200': (r) => r.status === 200 });
  const cerca = http.get(`${BASE}/api/v1/publicaciones/cercanas?lat=5.02&lng=-74.0&radio_km=60`);
  check(cerca, { 'cercanas 200': (r) => r.status === 200 });
  sleep(1);
}
