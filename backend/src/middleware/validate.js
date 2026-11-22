const { HttpError } = require('./errors');
const bad = (m) => new HttpError(400, m);
const empty = (val) => val === undefined || val === null || val === '';

const v = {
  str(val, name, { min = 1, max = 255, optional = false } = {}) {
    if (empty(val)) { if (optional) return null; throw bad(`${name} es obligatorio`); }
    if (typeof val !== 'string') throw bad(`${name} debe ser texto`);
    const s = val.trim();
    if (s.length < min || s.length > max) throw bad(`${name} debe tener entre ${min} y ${max} caracteres`);
    return s;
  },
  num(val, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
    if (empty(val)) { if (optional) return null; throw bad(`${name} es obligatorio`); }
    const n = typeof val === 'string' ? Number(val.trim()) : val;
    if (typeof n !== 'number' || !Number.isFinite(n)) throw bad(`${name} debe ser un número`);
    if (n < min || n > max) throw bad(`${name} debe estar entre ${min} y ${max}`);
    return n;
  },
  int(val, name, opts = {}) {
    const n = v.num(val, name, opts);
    if (n === null) return null;
    if (!Number.isInteger(n)) throw bad(`${name} debe ser un número entero`);
    return n;
  },
  bool(val, name, { optional = false } = {}) {
    if (empty(val)) { if (optional) return null; throw bad(`${name} es obligatorio`); }
    if (val === true || val === 'true') return true;
    if (val === false || val === 'false') return false;
    throw bad(`${name} debe ser verdadero o falso`);
  },
  email(val) {
    const s = v.str(val, 'Correo', { max: 160 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad('Correo electrónico inválido');
    return s;
  },
  date(val, name) {
    if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val)) throw bad(`${name} debe tener formato AAAA-MM-DD`);
    const d = new Date(`${val}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== val) throw bad(`${name} no es una fecha válida`);
    return val;
  },
  oneOf(val, name, list, { optional = false } = {}) {
    if (empty(val)) { if (optional) return null; throw bad(`${name} es obligatorio`); }
    if (!list.includes(val)) throw bad(`${name} debe ser uno de: ${list.join(', ')}`);
    return val;
  },
  password(val) {
    if (typeof val !== 'string' || val.length < 8 || val.length > 100 || !/[A-Z]/.test(val) || !/\d/.test(val)) {
      throw bad('La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número');
    }
    return val;
  },
  stringArray(val, name, { max = 20 } = {}) {
    if (empty(val)) return [];
    if (!Array.isArray(val) || val.length > max || val.some((x) => typeof x !== 'string' || x.length > 60)) {
      throw bad(`${name} debe ser una lista de textos cortos (máximo ${max})`);
    }
    return val.map((x) => x.trim()).filter(Boolean);
  },
  id(val, name = 'id') {
    return v.int(val, name, { min: 1, max: 2147483647 });
  },
};

module.exports = v;
