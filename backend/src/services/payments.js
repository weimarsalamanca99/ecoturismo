// Adaptador de la pasarela de pagos SIMULADA.
// Para usar una pasarela real (Wompi, PayU, Stripe...) basta con reemplazar la función charge().
const crypto = require('crypto');
const { HttpError } = require('../middleware/errors');

const TARJETAS_PRUEBA = {
  rechazada: '4000000000000002',
  pendiente: '4000000000000044',
};

function luhn(num) {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i -= 1) {
    let d = Number(num[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function validarTarjeta({ numero, vence, cvv }, hoy = new Date()) {
  const n = String(numero || '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(n) || !luhn(n)) throw new HttpError(400, 'Número de tarjeta inválido');
  const m = /^(\d{2})\/(\d{2})$/.exec(String(vence || ''));
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) throw new HttpError(400, 'Fecha de vencimiento inválida (use MM/AA)');
  const year = 2000 + Number(m[2]);
  const month = Number(m[1]);
  if (year < hoy.getFullYear() || (year === hoy.getFullYear() && month < hoy.getMonth() + 1)) throw new HttpError(400, 'La tarjeta está vencida');
  if (!/^\d{3,4}$/.test(String(cvv || ''))) throw new HttpError(400, 'CVV inválido');
  return n;
}

/** Simula el cobro. No se almacenan datos de la tarjeta. */
async function charge({ tarjeta, monto }) {
  const numero = validarTarjeta(tarjeta);
  const referencia = `SIM-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  let estado = 'aprobado';
  if (numero === TARJETAS_PRUEBA.rechazada) estado = 'rechazado';
  else if (numero === TARJETAS_PRUEBA.pendiente) estado = 'pendiente';
  return { estado, referencia, monto };
}

module.exports = { charge, luhn, validarTarjeta, TARJETAS_PRUEBA };
