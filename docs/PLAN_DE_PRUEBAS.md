# Plan de pruebas — Entrega 3

Pruebas funcionales y no funcionales ligadas a las historias de usuario (HU) y requisitos de calidad (RNF). Completa la columna **Resultado** con la evidencia de tu ejecución (captura, salida de consola o reporte).

## Cómo ejecutarlas

```bash
cd backend && npm test                 # unitarias + integración (BD de pruebas)
k6 run load-tests/search.js            # RNF-03 y RNF-06
k6 run load-tests/booking.js           # RNF-09 (concurrencia)
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t URL   # RNF-01
npx lighthouse URL --view              # RNF-05, RNF-06, RNF-07 (usabilidad y rendimiento)
```

## Pruebas funcionales (automatizadas en `backend/tests/api.test.js`)

| ID | HU / RF | Caso | Resultado esperado | Resultado |
|---|---|---|---|---|
| CP-01 | HU-01 | Registrar usuario con datos válidos | 201 y cuenta creada | |
| CP-02 | HU-01 | Registrar correo existente / contraseña débil / sin consentimiento | 409 / 400 / 400 | |
| CP-03 | HU-02 | 5 intentos fallidos de inicio de sesión | Bloqueo temporal (429) | |
| CP-04 | HU-04 | Publicar sin campos válidos y sin 3 imágenes | 400 | |
| CP-05 | HU-07 | Búsqueda con filtros de precio, texto y fechas | Solo resultados que cumplen | |
| CP-06 | HU-08 | Búsqueda por cercanía | Resultados dentro del radio, con distancia | |
| CP-07 | HU-11 | 30 solicitudes simultáneas sobre un cupo | Una sola reserva (201), el resto 409 | |
| CP-08 | HU-12 | Pago rechazado y pago aprobado | 402 sin confirmar / 201 con comisión del 10 % | |
| CP-09 | HU-13 | Reseña sin reserva finalizada / duplicada | 409 | |
| CP-10 | HU-18 | Cancelar con más y con menos de 48 h | Con reembolso / sin reembolso | |
| CP-11 | HU-14, 15 | Moderación y suspensión por administrador | Decisión aplicada y auditada | |
| CP-12 | RF-12 | Reservas vencidas liberan el cupo | Estado `expirada` y cupo restituido | |

## Pruebas no funcionales

| ID | Requisito | Prueba | Criterio de aceptación | Resultado |
|---|---|---|---|---|
| NF-01 | RNF-01 | OWASP ZAP baseline | Sin alertas de riesgo alto | |
| NF-02 | RNF-01 | Pruebas de autorización por rol (automatizadas) | 401/403 en rutas protegidas | |
| NF-03 | RNF-03 | k6 `search.js` con 500 usuarios virtuales | Sin errores y p95 < 3 s | |
| NF-04 | RNF-06 | Lighthouse (rendimiento) | Tiempo de respuesta < 3 s en operaciones principales | |
| NF-05 | RNF-05 | Revisión en 360 px, 768 px y 1200 px | Sin desplazamiento horizontal | |
| NF-06 | RNF-07 | Prueba de usabilidad con 5 usuarios | Buscar y reservar en máximo 5 pasos | |
| NF-07 | RNF-09 | k6 `booking.js` (50 solicitudes) | 1 reserva y 49 conflictos, sin errores 500 | |
| NF-08 | RNF-02 | Revisión Ley 1581 | Consentimiento, supresión de cuenta y datos mínimos | |
