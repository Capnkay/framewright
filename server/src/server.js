// server/src/server.js — the process entrypoint. `npm run server`.
//
// Kept separate from app.js so the app can be constructed and exercised without
// binding a port. T-002.

// `.env` is read FIRST, before any other module is loaded, and that ordering is the
// whole point of the shape of this file. ES imports are hoisted and evaluated before
// any statement in the module body runs, so a plain `import { loadEnvFile }` followed
// by `loadEnvFile()` would still let every transitive import evaluate against an
// environment with no key in it — and any module that reads process.env at load time
// would cache the wrong answer. Dynamic import after the load is the only ordering that
// actually holds. T-151.
import { loadEnvFile } from './loadEnvFile.js';

const loaded = loadEnvFile();

const { createApp } = await import('./app.js');
const { createStore } = await import('./store/index.js');
const { seedStore } = await import('./store/seed.js');

const PORT = Number(process.env.PORT) || 5000;

const app = createApp({ env: process.env });

const store = createStore(process.env);
await seedStore(store);

app.listen(PORT, () => {
  // §17.1's structured logging lands at T-086; until then, one honest line.
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'info',
      msg: 'framewright api listening',
      port: PORT,
      store: process.env.MONGODB_URI ? 'mongo' : 'json',
      // Names only, never values. Tells you at a glance whether the hosted paths are
      // live on this machine, which is otherwise invisible until a job comes out
      // looking like the reference template.
      // Names only, and read from what the loader reported rather than from the
      // environment: §16.2 says the orchestrator is the ONLY place that reads model
      // credentials, and a test enforces it by scanning source. Naming the variable
      // here to decide a log string would make this a second reader.
      envFile: loaded.length ? loaded.join(',') : 'none',
    }),
  );
});
