-- Esquema de la plataforma Eco Turismo Experiencial (PostgreSQL 14+). Idempotente.

CREATE TABLE IF NOT EXISTS usuario (
  id_usuario        SERIAL PRIMARY KEY,
  nombre            TEXT NOT NULL,
  correo            TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  telefono          TEXT,
  descripcion       TEXT,
  rol               TEXT NOT NULL CHECK (rol IN ('turista','anfitrion','administrador','negocio')),
  estado            TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','suspendido','eliminado')),
  acepta_datos      BOOLEAN NOT NULL,
  correo_verificado BOOLEAN NOT NULL DEFAULT FALSE,
  token_verificacion TEXT,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta   TIMESTAMPTZ,
  reset_token_hash  TEXT,
  reset_expira      TIMESTAMPTZ,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS publicacion (
  id_publicacion SERIAL PRIMARY KEY,
  id_anfitrion   INTEGER NOT NULL REFERENCES usuario(id_usuario),
  tipo           TEXT NOT NULL CHECK (tipo IN ('alojamiento','actividad')),
  titulo         TEXT NOT NULL,
  descripcion    TEXT NOT NULL,
  municipio      TEXT NOT NULL,
  precio_base    NUMERIC(12,2) NOT NULL CHECK (precio_base > 0),
  capacidad      INTEGER NOT NULL CHECK (capacidad > 0),
  lat            DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
  estado         TEXT NOT NULL DEFAULT 'borrador'
                 CHECK (estado IN ('borrador','pendiente','publicada','pausada','rechazada','eliminada')),
  motivo_rechazo TEXT,
  promedio       NUMERIC(3,2) NOT NULL DEFAULT 0,
  num_resenas    INTEGER NOT NULL DEFAULT 0,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_publicacion_estado_tipo ON publicacion (estado, tipo);
CREATE INDEX IF NOT EXISTS idx_publicacion_municipio ON publicacion (municipio);
CREATE INDEX IF NOT EXISTS idx_publicacion_anfitrion ON publicacion (id_anfitrion);

CREATE TABLE IF NOT EXISTS alojamiento (
  id_publicacion   INTEGER PRIMARY KEY REFERENCES publicacion(id_publicacion) ON DELETE CASCADE,
  num_habitaciones INTEGER NOT NULL CHECK (num_habitaciones > 0),
  servicios        TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS actividad (
  id_publicacion  INTEGER PRIMARY KEY REFERENCES publicacion(id_publicacion) ON DELETE CASCADE,
  duracion_horas  NUMERIC(4,1) NOT NULL CHECK (duracion_horas > 0),
  dificultad      TEXT NOT NULL CHECK (dificultad IN ('baja','media','alta')),
  punto_encuentro TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS negocio_local (
  id_negocio  SERIAL PRIMARY KEY,
  id_usuario  INTEGER NOT NULL REFERENCES usuario(id_usuario),
  nombre      TEXT NOT NULL,
  categoria   TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  municipio   TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  contacto    TEXT,
  estado      TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado')),
  motivo_rechazo TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imagen (
  id_imagen      SERIAL PRIMARY KEY,
  id_publicacion INTEGER REFERENCES publicacion(id_publicacion) ON DELETE CASCADE,
  id_negocio     INTEGER REFERENCES negocio_local(id_negocio) ON DELETE CASCADE,
  contenido      BYTEA NOT NULL,
  mime           TEXT NOT NULL DEFAULT 'image/webp',
  orden          INTEGER NOT NULL DEFAULT 0,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(id_publicacion, id_negocio) = 1)
);
CREATE INDEX IF NOT EXISTS idx_imagen_publicacion ON imagen (id_publicacion);
CREATE INDEX IF NOT EXISTS idx_imagen_negocio ON imagen (id_negocio);

CREATE TABLE IF NOT EXISTS disponibilidad (
  id_disponibilidad SERIAL PRIMARY KEY,
  id_publicacion    INTEGER NOT NULL REFERENCES publicacion(id_publicacion) ON DELETE CASCADE,
  fecha             DATE NOT NULL,
  cupos_totales     INTEGER NOT NULL CHECK (cupos_totales >= 0),
  cupos_disponibles INTEGER NOT NULL,
  bloqueado         BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (id_publicacion, fecha),
  CHECK (cupos_disponibles BETWEEN 0 AND cupos_totales)   -- impide sobreventa de cupos
);

CREATE TABLE IF NOT EXISTS reserva (
  id_reserva     SERIAL PRIMARY KEY,
  id_turista     INTEGER NOT NULL REFERENCES usuario(id_usuario),
  id_publicacion INTEGER NOT NULL REFERENCES publicacion(id_publicacion),
  fecha_inicio   DATE NOT NULL,
  fecha_fin      DATE NOT NULL,
  num_personas   INTEGER NOT NULL CHECK (num_personas > 0),
  cupos_usados   INTEGER NOT NULL CHECK (cupos_usados > 0),
  total          NUMERIC(12,2) NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'pendiente_pago'
                 CHECK (estado IN ('pendiente_pago','confirmada','cancelada','finalizada','expirada')),
  expira_en      TIMESTAMPTZ,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_fin > fecha_inicio)
);
CREATE INDEX IF NOT EXISTS idx_reserva_turista ON reserva (id_turista);
CREATE INDEX IF NOT EXISTS idx_reserva_publicacion ON reserva (id_publicacion);
CREATE INDEX IF NOT EXISTS idx_reserva_estado_expira ON reserva (estado, expira_en);

CREATE TABLE IF NOT EXISTS pago (
  id_pago    SERIAL PRIMARY KEY,
  id_reserva INTEGER NOT NULL REFERENCES reserva(id_reserva),
  monto      NUMERIC(12,2) NOT NULL,
  comision   NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado     TEXT NOT NULL CHECK (estado IN ('aprobado','rechazado','pendiente','reembolsado')),
  referencia TEXT,
  fecha      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pago_reserva ON pago (id_reserva);

CREATE TABLE IF NOT EXISTS resena (
  id_resena          SERIAL PRIMARY KEY,
  id_reserva         INTEGER NOT NULL UNIQUE REFERENCES reserva(id_reserva),
  id_publicacion     INTEGER NOT NULL REFERENCES publicacion(id_publicacion),
  id_turista         INTEGER NOT NULL REFERENCES usuario(id_usuario),
  calificacion       INTEGER NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentario         TEXT,
  estado_moderacion  TEXT NOT NULL DEFAULT 'aprobada' CHECK (estado_moderacion IN ('aprobada','reportada','retirada')),
  fecha              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resena_publicacion ON resena (id_publicacion);

CREATE TABLE IF NOT EXISTS auditoria (
  id_log     SERIAL PRIMARY KEY,
  id_admin   INTEGER NOT NULL REFERENCES usuario(id_usuario),
  accion     TEXT NOT NULL,
  entidad    TEXT NOT NULL,
  id_entidad INTEGER,
  detalle    JSONB,
  fecha      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- La auditoría es de solo inserción.
CREATE OR REPLACE FUNCTION auditoria_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla auditoria es de solo inserción';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria;
CREATE TRIGGER trg_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();
