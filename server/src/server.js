// server/src/server.js — the process entrypoint. `npm run server`.
//
// Kept separate from app.js so the app can be constructed and exercised without
// binding a port. T-002.

import { createApp } from './app.js';
import { createStore } from './store/index.js';
import { seedStore } from './store/seed.js';

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
    }),
  );
});
