const config = require('./config');
const app = require('./app');
const { migrate } = require('./migrate');
const { pool } = require('./db');
const scheduler = require('./services/scheduler');

async function main() {
  await migrate();
  if (config.seedDemo) {
    const { seed } = require('./seed');
    await seed();
  }
  const server = app.listen(config.port, () => {
    console.log(`Eco Turismo escuchando en el puerto ${config.port} (${config.env})`);
  });
  const timer = scheduler.start();

  const shutdown = (signal) => {
    console.log(`${signal} recibido, cerrando...`);
    clearInterval(timer);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('No se pudo iniciar la aplicación:', e);
  process.exit(1);
});
