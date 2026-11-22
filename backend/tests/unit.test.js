// Pruebas unitarias (no requieren base de datos).
process.env.NODE_ENV = 'test';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { luhn, validarTarjeta, charge, TARJETAS_PRUEBA } = require('../src/services/payments');
const { addDays, daysBetween } = require('../src/utils/dates');
const v = require('../src/middleware/validate');

describe('Fechas', () => {
  test('addDays y daysBetween', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(daysBetween('2026-11-20', '2026-11-23'), 3);
    assert.equal(daysBetween('2026-11-23', '2026-11-20'), -3);
  });
});

describe('Validaciones', () => {
  test('fecha válida e inválida', () => {
    assert.equal(v.date('2026-02-28', 'f'), '2026-02-28');
    assert.throws(() => v.date('2026-02-30', 'f'), /válida/);
    assert.throws(() => v.date('28/02/2026', 'f'), /AAAA-MM-DD/);
  });
  test('contraseña segura', () => {
    assert.equal(v.password('Segura123'), 'Segura123');
    assert.throws(() => v.password('corta1A'));
    assert.throws(() => v.password('sinmayuscula1'));
    assert.throws(() => v.password('SinNumeroAqui'));
  });
  test('correo, enteros y listas', () => {
    assert.equal(v.email('  USER@Mail.com '), 'user@mail.com');
    assert.throws(() => v.email('no-es-correo'));
    assert.equal(v.int('5', 'n', { min: 1, max: 10 }), 5);
    assert.throws(() => v.int('5.5', 'n'));
    assert.throws(() => v.int(11, 'n', { max: 10 }));
    assert.deepEqual(v.stringArray(['a ', ' b'], 'x'), ['a', 'b']);
    assert.throws(() => v.stringArray('texto', 'x'));
  });
});

describe('Pasarela simulada', () => {
  const ok = { vence: '12/40', cvv: '123' };
  test('algoritmo de Luhn', () => {
    assert.ok(luhn('4111111111111111'));
    assert.ok(luhn(TARJETAS_PRUEBA.rechazada));
    assert.ok(luhn(TARJETAS_PRUEBA.pendiente));
    assert.ok(!luhn('4111111111111112'));
  });
  test('validación de tarjeta', () => {
    assert.throws(() => validarTarjeta({ numero: '1234', ...ok }), /inválido/);
    assert.throws(() => validarTarjeta({ numero: '4111111111111111', vence: '01/20', cvv: '123' }), /vencida/);
    assert.throws(() => validarTarjeta({ numero: '4111111111111111', vence: '13/40', cvv: '123' }), /vencimiento/);
    assert.throws(() => validarTarjeta({ numero: '4111111111111111', vence: '12/40', cvv: '1' }), /CVV/);
    assert.equal(validarTarjeta({ numero: '4111 1111 1111 1111', ...ok }), '4111111111111111');
  });
  test('estados del cobro', async () => {
    assert.equal((await charge({ tarjeta: { numero: '4111111111111111', ...ok }, monto: 1000 })).estado, 'aprobado');
    assert.equal((await charge({ tarjeta: { numero: TARJETAS_PRUEBA.rechazada, ...ok }, monto: 1000 })).estado, 'rechazado');
    assert.equal((await charge({ tarjeta: { numero: TARJETAS_PRUEBA.pendiente, ...ok }, monto: 1000 })).estado, 'pendiente');
  });
});
