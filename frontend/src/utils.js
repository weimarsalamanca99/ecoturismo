export const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n ?? 0);
export const fdate = (s) => {
  if (!s) return '';
  const d = new Date(String(s).length === 10 ? `${s}T00:00:00` : s);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const imgUrl = (id) => (id ? `/api/v1/imagenes/${id}` : '');
export const today = () => new Date().toLocaleDateString('en-CA');
export const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-CA');
};
export const nights = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

export const ESTADO = {
  borrador: ['Borrador', 'grey'], pendiente: ['En moderación', 'amber'], publicada: ['Publicada', 'green'], pausada: ['Pausada', 'grey'],
  rechazada: ['Rechazada', 'red'], pendiente_pago: ['Pendiente de pago', 'amber'], confirmada: ['Confirmada', 'green'],
  cancelada: ['Cancelada', 'red'], finalizada: ['Finalizada', 'blue'], expirada: ['Expirada', 'grey'],
  aprobado: ['Aprobado', 'green'], rechazado: ['Rechazado', 'red'], activo: ['Activo', 'green'], suspendido: ['Suspendido', 'red'], eliminado: ['Eliminado', 'grey'],
};
export const estadoLabel = (e) => (ESTADO[e] ? ESTADO[e][0] : e);
export const estadoColor = (e) => (ESTADO[e] ? ESTADO[e][1] : 'grey');
