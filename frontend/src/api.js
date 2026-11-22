import { useAuth } from './stores/auth';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function withQuery(url, query) {
  if (!query) return url;
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v !== null && v !== undefined));
  const s = qs.toString();
  return s ? `${url}${url.includes('?') ? '&' : '?'}${s}` : url;
}

async function request(path, { method = 'GET', body, form, query } = {}) {
  const auth = useAuth();
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(withQuery(BASE + path, query), { method, headers, body: payload });
  } catch (e) {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }
  if (res.status === 401 && auth.token) {
    auth.logout();
    if (!location.pathname.startsWith('/login')) location.assign('/login?expirada=1');
  }
  return res;
}

export async function api(path, opts) {
  const res = await request(path, opts);
  if (res.status === 204) return null;
  const data = (res.headers.get('content-type') || '').includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, (data && (data.error || data.mensaje)) || `Error ${res.status}`, data);
  return data;
}

/** Descarga un archivo (por ejemplo, un reporte CSV) enviando el token de autenticación. */
export async function download(path, query, filename) {
  const res = await request(path, { query });
  if (!res.ok) throw new ApiError(res.status, 'No se pudo generar el reporte');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
