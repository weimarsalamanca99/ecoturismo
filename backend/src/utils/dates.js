const config = require('../config');

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: config.tz, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Fecha actual (AAAA-MM-DD) en la zona horaria de la aplicación. */
const today = () => fmt.format(new Date());
const toUtc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const addDays = (iso, n) => new Date(toUtc(iso) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);

module.exports = { today, addDays, daysBetween };
