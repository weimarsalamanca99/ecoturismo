# ---------- 1) Compilar el frontend (Vue + Vite) ----------
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ---------- 2) Backend (Express) sirviendo la API y el frontend compilado ----------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY backend/ ./
COPY --from=frontend /app/frontend/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
