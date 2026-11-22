# 🌿 Eco Turismo Experiencial

Plataforma web tipo *marketplace* para publicar, buscar y reservar **alojamientos rurales, actividades de ecoturismo y comercio local**.
Proyecto final de **Ingeniería de Software I** (Politécnico Grancolombiano). Implementa las historias de usuario definidas en las entregas 1 y 2 (ver carpeta [`docs/`](docs)).

## Funcionalidades

| Rol | Qué puede hacer |
|---|---|
| **Turista** | Buscar con filtros (texto, tipo, precio, fechas, personas, calificación), ver resultados en lista o mapa, buscar por cercanía, reservar, pagar (pasarela simulada), cancelar, ver su historial y dejar reseñas. |
| **Anfitrión** | Publicar alojamientos y actividades (con fotos y ubicación en mapa), gestionar la disponibilidad por día, pausar/reanudar/eliminar, ver reservas recibidas. |
| **Negocio local** | Registrar su negocio con fotos y ubicación para aparecer en la sección de comercio local. |
| **Administrador** | Panel con indicadores, gestión de usuarios (suspender/reactivar), moderación de publicaciones, negocios y reseñas reportadas, reportes (JSON/CSV) y auditoría. |

### Cobertura de historias de usuario

| HU | Descripción | Dónde |
|---|---|---|
| HU-01, 02 | Registro, inicio de sesión (bloqueo tras 5 intentos), recuperar contraseña | `routes/auth.js` · Login/Registro/Recuperar |
| HU-03 | Perfil y eliminación de cuenta (anonimización, Ley 1581) | `routes/usuarios.js` · Perfil |
| HU-04, 05, 06 | Publicar alojamiento / actividad, fotos, editar, pausar, eliminar | `routes/publicaciones.js` · Panel del anfitrión |
| HU-07, 08 | Búsqueda con filtros y por cercanía + mapa | `GET /publicaciones`, `/cercanas` · Inicio |
| HU-09 | Calendario de disponibilidad y cupos | `PUT /publicaciones/:id/disponibilidad` |
| HU-10, 11 | Reserva con control de reservas simultáneas | `routes/reservas.js` (transacción `FOR UPDATE` + `CHECK`) |
| HU-12 | Pago electrónico simulado y comisión | `routes/pagos.js`, `services/payments.js` |
| HU-13 | Calificaciones y reseñas | `routes/resenas.js` |
| HU-14, 15, 16 | Usuarios, moderación, reportes | `routes/admin.js` · Panel de administración |
| HU-17 | Negocios locales | `routes/negocios.js` |
| HU-18 | Cancelación con política de reembolso (48 h) | `POST /reservas/:id/cancelar` |
| HU-19, 20, 21 | Historial, reservas recibidas, notificaciones por correo | `reservas.js`, `services/mailer.js` |

## Tecnologías

- **Frontend:** Vue 3 + Vite, Vue Router, Pinia, Leaflet/OpenStreetMap; estilos propios basados en Material Design, *mobile-first*.
- **Backend:** Node.js 22 + Express (monolito modular), API REST versionada en `/api/v1`.
- **Base de datos:** PostgreSQL 16 (transacciones ACID).
- **Seguridad:** HTTPS (en el proxy/plataforma), JWT, bcrypt, control de acceso por rol, consultas parametrizadas, `helmet` (CSP y cabeceras), límite de peticiones, validación de entradas, imágenes re-procesadas con `sharp`.
- **Calidad:** pruebas unitarias y de integración (`node:test`), pruebas de carga (k6), CI con GitHub Actions.
- **Despliegue:** Docker, Docker Compose (+ Caddy para HTTPS) y Blueprint de Render.

## Ejecutar con Docker (recomendado)

```bash
cp .env.example .env        # edita JWT_SECRET y POSTGRES_PASSWORD
docker compose up -d --build
# Abre http://localhost:3000
```

Con `SEED_DEMO=true` se crean datos de demostración:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@eco.test` | `Admin123!` |
| Anfitrión | `anfitrion@eco.test` | `Host123!` |
| Turista | `turista@eco.test` | `Turista123!` |
| Negocio | `negocio@eco.test` | `Negocio123!` |

> ⚠️ En un servidor real usa `SEED_DEMO=false` o cambia estas claves: son públicas.

Tarjetas de la pasarela simulada: `4111 1111 1111 1111` (aprobada), `4000 0000 0000 0002` (rechazada), `4000 0000 0000 0044` (pendiente; se aprueba sola en ~1 min). Usa cualquier fecha futura y CVV de 3 dígitos.

## Ejecutar en desarrollo (sin Docker)

Requisitos: Node.js 22 y PostgreSQL 14+.

```bash
# 1) Base de datos
createdb ecoturismo   # o usa: docker run -d -p 5432:5432 -e POSTGRES_USER=eco -e POSTGRES_PASSWORD=eco -e POSTGRES_DB=ecoturismo postgres:16-alpine

# 2) Backend (puerto 3000)
cd backend
cp ../.env.example .env
npm install
npm run dev            # crea las tablas automáticamente; con SEED_DEMO=true crea datos de ejemplo

# 3) Frontend (puerto 5173, con proxy a la API)
cd ../frontend
npm install
npm run dev
```

## Pruebas

```bash
cd backend
npm test                        # unitarias + integración (requiere DATABASE_URL a una BD de PRUEBAS: se vacía)
node --test tests/unit.test.js  # solo unitarias (no requieren base de datos)

# Carga y rendimiento (RNF-03 y RNF-06): https://k6.io
k6 run -e BASE_URL=http://localhost:3000 load-tests/search.js
k6 run -e BASE_URL=http://localhost:3000 -e PUB_ID=1 -e FECHA_INICIO=2026-12-10 -e FECHA_FIN=2026-12-12 load-tests/booking.js

# Seguridad (OWASP ZAP baseline)
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:3000
```

⚠️ **`npm test` ejecuta `TRUNCATE` sobre todas las tablas**: apúntalo siempre a una base de datos de pruebas (por ejemplo `ecoturismo_test`), nunca a la de producción. Ver el [plan de pruebas](docs/PLAN_DE_PRUEBAS.md).

## Variables de entorno principales

| Variable | Descripción | Por defecto |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión de PostgreSQL | `postgres://eco:eco@localhost:5432/ecoturismo` |
| `DB_SSL` | `true` si el proveedor exige SSL (Render, Supabase…) | `false` |
| `JWT_SECRET` | Secreto de firma de tokens (**obligatorio en producción**) | — |
| `APP_URL` | URL pública (enlaces de los correos) | `http://localhost:3000` |
| `SEED_DEMO` | Crea datos de demostración al iniciar | `false` |
| `COMISION_PORCENTAJE` | Comisión de la plataforma por reserva | `10` |
| `RESERVA_RETENCION_MIN` | Minutos que se retiene el cupo mientras se paga | `10` |
| `SMTP_*` | Servidor de correo (sin él, los correos se imprimen en el log) | — |

## API (resumen)

Prefijo `/api/v1`. Autenticación: `Authorization: Bearer <token>`.

| Método | Ruta | Rol |
|---|---|---|
| POST | `/auth/registro`, `/auth/login`, `/auth/recuperar`, `/auth/restablecer` | Público |
| GET, PUT, DELETE | `/usuarios/me` | Autenticado |
| GET | `/publicaciones`, `/publicaciones/cercanas`, `/publicaciones/:id`, `/publicaciones/:id/disponibilidad`, `/publicaciones/:id/resenas` | Público |
| POST, PUT, DELETE | `/publicaciones`, `/publicaciones/:id`, `/:id/enviar`, `/:id/pausar`, `/:id/reanudar`, `/:id/imagenes`, `PUT /:id/disponibilidad` | Anfitrión |
| POST | `/reservas`, `/reservas/:id/cancelar` | Turista (cancelar: también anfitrión) |
| GET | `/reservas/mias`, `/reservas/recibidas`, `/reservas/:id` | Turista / Anfitrión |
| POST | `/pagos`, `/resenas`, `/resenas/:id/reportar` | Turista |
| GET, POST, PUT | `/negocios`, `/negocios/mios`, `/negocios/:id/imagenes` | Público / Negocio |
| GET, PATCH | `/admin/resumen`, `/admin/usuarios`, `/admin/moderacion`, `/admin/reportes`, `/admin/auditoria` | Administrador |
| GET | `/health`, `/imagenes/:id` | Público |

## Decisiones de diseño y diferencias con la Entrega 2

- **Geolocalización con latitud/longitud y fórmula de Haversine** en SQL en lugar de PostGIS, para que la base de datos funcione en cualquier servicio gestionado gratuito. Migrar a PostGIS (índice GiST) es una mejora sencilla si crece el volumen.
- **Imágenes almacenadas en PostgreSQL (`bytea`)**, convertidas a WebP (máx. 1600 px): las plataformas gratuitas tienen disco efímero. Para más volumen, mover a almacenamiento S3 compatible.
- **Frontend con Vue 3 + Vite y estilos propios** (siguiendo Material Design) en lugar de Vuetify, para reducir dependencias.
- **Control de reservas simultáneas**: transacción que bloquea (`FOR UPDATE`) las filas de disponibilidad del rango, siempre en el mismo orden, verifica cupos y los descuenta; el `CHECK (cupos_disponibles BETWEEN 0 AND cupos_totales)` es la última barrera. Una tarea cada minuto libera las reservas cuya retención venció.
- **Unidades de cupo:** en alojamientos cada día tiene "unidades" (la cabaña/finca completa = 1); en actividades el cupo se mide en personas.
- **Token JWT en `localStorage`** por simplicidad académica; en producción es preferible una cookie `HttpOnly` + `SameSite`.

## Estructura

```
backend/   API Express (src/routes, src/services, src/middleware), esquema SQL, pruebas y k6
frontend/  SPA Vue 3 (src/views, src/components, src/stores)
docs/      Entregas 1 y 2, presentación y plan de pruebas
Dockerfile · docker-compose.yml · Caddyfile · render.yaml · .github/workflows/ci.yml
```

## Mejoras futuras

Pasarela de pagos real (Wompi/PayU/Stripe), suscripción premium y paquetes turísticos (RF-22 y RF-23), PostGIS, caché de búsquedas, almacenamiento de objetos para imágenes, notificaciones push y pruebas E2E con Cypress/Playwright.

## Autores

[Nombres de los integrantes del grupo] · Ingeniería de Software I · Docente: Vilma Yenny Bohórquez
