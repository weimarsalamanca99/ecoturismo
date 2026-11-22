const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', '001_schema.sql'), 'utf8');
  await pool.query(sql);
}
module.exports = { migrate };
