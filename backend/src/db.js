const { Pool, types } = require('pg');
const config = require('./config');

types.setTypeParser(1082, (v) => v); // date -> 'YYYY-MM-DD' (sin desfases de zona horaria)
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric -> number
types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 (count) -> number

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});
pool.on('error', (e) => console.error('Error inesperado del pool de PostgreSQL:', e.message));

const query = (text, params) => pool.query(text, params);

/** Ejecuta fn(client) dentro de una transacción (COMMIT o ROLLBACK). */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignorar */ }
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
