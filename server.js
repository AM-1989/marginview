// Hostinger entry point — this file must stay at root as "server.js"
// Delegates to server/index.js which is CommonJS (its own package.json has "type":"commonjs")
import('./server/index.js').catch(err => {
  console.error('[startup] Impossibile avviare il server:', err);
  process.exit(1);
});
