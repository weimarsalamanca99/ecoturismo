# Guía de despliegue y publicación en GitHub

## 1. Subir el código a GitHub

1. Crea una cuenta en <https://github.com> y un repositorio **vacío** (botón *New*; sin README, sin .gitignore). Por ejemplo `eco-turismo-experiencial`.
2. En la carpeta del proyecto (ya trae un repositorio Git con el primer *commit*):

```bash
git branch -M main
git remote add origin https://github.com/TU_USUARIO/eco-turismo-experiencial.git
git push -u origin main
```

   GitHub pedirá autenticación: usa un *Personal Access Token* (Settings → Developer settings → Tokens) o `gh auth login` si tienes GitHub CLI. **Nunca subas el archivo `.env`** (ya está en `.gitignore`).
3. Verifica en la pestaña **Actions** que el flujo *CI* pase en verde (ejecuta las pruebas con PostgreSQL y compila el frontend).
4. Invita a tu equipo (Settings → Collaborators) y trabaja con ramas + *pull requests*. Recomendado: haz `npm install` en `backend/` y `frontend/` una vez y sube los `package-lock.json` generados.

## 2. Opción A — Render (la más simple: URL pública con HTTPS)

1. Crea una cuenta en <https://render.com> y conéctala a tu GitHub.
2. **New → Blueprint** y elige tu repositorio. Render lee `render.yaml`, crea la base de datos PostgreSQL y el servicio web Docker, y genera `JWT_SECRET` automáticamente.
3. Espera el *build* (varios minutos). Al terminar tendrás una URL como `https://eco-turismo.onrender.com`.
4. Comprueba `https://TU-URL/api/v1/health` (debe responder `{"estado":"ok"}`) y abre la página.
5. Los datos de demostración se crean con `SEED_DEMO=true`. Cuando el sitio sea real, cambia esa variable a `false` y cambia las claves de los usuarios demo.

Notas: en el plan gratuito el servicio se "duerme" tras un tiempo sin tráfico (la primera visita tarda) y la base de datos gratuita puede tener límites o vencer; consulta las condiciones vigentes en Render. Las imágenes se guardan en la base de datos, por lo que no se pierden al reiniciar.

## 3. Opción B — Servidor propio (VPS) con Docker Compose + HTTPS

Funciona en cualquier VPS Ubuntu (DigitalOcean, AWS Lightsail, Hetzner, Contabo, una VM de Azure/GCP…).

1. Apunta un dominio (o subdominio gratuito de <https://www.duckdns.org>) a la IP pública del servidor. Abre los puertos **80 y 443**.
2. Instala Docker: <https://docs.docker.com/engine/install/ubuntu/>
3. Clona el repositorio y configura:

```bash
git clone https://github.com/TU_USUARIO/eco-turismo-experiencial.git
cd eco-turismo-experiencial
cp .env.example .env
nano .env     # JWT_SECRET, POSTGRES_PASSWORD, DOMAIN=tu.dominio.com, APP_URL=https://tu.dominio.com, SEED_DEMO
docker compose --profile https up -d --build
```

4. Caddy obtiene el certificado de Let's Encrypt automáticamente. Abre `https://tu.dominio.com`.
5. Operación diaria:

```bash
docker compose logs -f app                      # ver registros
git pull && docker compose --profile https up -d --build   # actualizar
docker compose exec db pg_dump -U eco ecoturismo > respaldo.sql   # copia de seguridad
```

## 4. Otras plataformas

La aplicación es una sola imagen Docker (`Dockerfile`) que necesita un PostgreSQL y las variables `DATABASE_URL`, `DB_SSL`, `JWT_SECRET`, `APP_URL`. Sirve igual en Railway, Fly.io, Google Cloud Run, Azure Container Apps, etc.

## 5. Lista de verificación después de publicar

- [ ] `JWT_SECRET` largo y aleatorio; `.env` fuera de Git.
- [ ] `SEED_DEMO=false` (o claves de demostración cambiadas).
- [ ] HTTPS activo (Render y Caddy lo hacen solos).
- [ ] SMTP configurado si quieres que lleguen los correos de verificación y confirmación.
- [ ] Copias de seguridad de la base de datos.
- [ ] Ejecuta las pruebas de carga (`k6`) y de seguridad (OWASP ZAP) contra la URL pública y guarda la evidencia para la entrega.
- [ ] Cambia el correo/clave del administrador y revisa los textos legales (política de datos).

## 6. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `JWT_SECRET es obligatorio en producción` | Falta la variable | Defínela en `.env` / panel de la plataforma |
| `ECONNREFUSED` o error de SSL a la base de datos | `DATABASE_URL` o `DB_SSL` incorrectos | Con proveedores gestionados usa `DB_SSL=true` |
| Pantalla en blanco al recargar una ruta | Falta el frontend compilado | Construye con el `Dockerfile` (copia `dist` en `backend/public`) |
| No llegan correos | Sin SMTP | Configura `SMTP_*`; sin ellos se imprimen en el log |
| El mapa no carga | Bloqueo de `tile.openstreetmap.org` | Revisa la red/el CSP o usa otro proveedor de teselas |
