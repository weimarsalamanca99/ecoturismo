const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

/** Envía un correo. Sin SMTP configurado, lo imprime en consola (útil en desarrollo y demos). Nunca lanza errores. */
async function sendMail(to, subject, text) {
  try {
    if (!transporter) {
      if (config.env !== 'test') console.log(`[correo simulado] Para: ${to} | Asunto: ${subject}\n${text}\n`);
      return;
    }
    await transporter.sendMail({ from: config.smtp.from, to, subject, text });
  } catch (e) {
    console.error('No se pudo enviar el correo:', e.message);
  }
}
module.exports = { sendMail };
