const { spawn, execSync } = require('child_process');
const request = require('supertest');
const { pool } = require('../src/models/db');
const { resetDb, randomPlayerId } = require('./testHelpers');

const BASE_URL = 'http://localhost:3001'; // separate port so it doesn't clash with your dev server

function startServer(extraEnv = {}) {
  const child = spawn('node', ['src/server.js'], {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL, // now correctly set to wallet_test_db via jest.setup.js
      PORT: '3001',
      ...extraEnv,
    },
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  return child;
}

function waitFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntilUp(url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/v1/wallets/healthcheck-probe`);
      if (res.status) return true;
    } catch {
      // not up yet
    }
    await waitFor(100);
  }
  throw new Error('server did not come up in time');
}

beforeEach(async () => {
  await resetDb();
});

afterAll(() => pool.end());

describe('Crash recovery', () => {
  test('kill -9 mid-purchase leaves no partial effect; restart recovers cleanly', async () => {
    const playerId = randomPlayerId();

    // 1. Start server WITH the artificial delay so we can land the kill mid-transaction
    let server = startServer({ CRASH_TEST_DELAY_MS: '1500' });
    await waitUntilUp(BASE_URL);

    // Seed balance
    await request(BASE_URL)
      .post(`/v1/wallets/${playerId}/credit`)
      .set('Idempotency-Key', 'seed')
      .send({ amount: 100, reason: 'seed' });

    // 2. Fire a purchase but don't await its response — it'll hang in the
    // artificial delay window, transaction open but uncommitted.
    const purchasePromise = request(BASE_URL)
      .post(`/v1/wallets/${playerId}/purchase`)
      .set('Idempotency-Key', 'crash-key-1')
      .send({ itemId: 'sword', price: 40 })
      .catch(() => null); // connection will be reset by the kill — expected

    // 3. Wait until we're inside the delay window, then hard-kill the process
    await waitFor(500);
    execSync(`taskkill /PID ${server.pid} /F`);

    await purchasePromise.catch(() => {}); // let the dangling request settle/fail

    // 4. Restart the server WITHOUT the delay
    server = startServer();
    await waitUntilUp(BASE_URL);

    // 5. Assert: the transaction never committed (Postgres rolled it back on
    // connection loss), so the state must be exactly the pre-purchase state —
    // no debit without its grant.
    const stateAfterCrash = await request(BASE_URL).get(`/v1/wallets/${playerId}`);
    expect(stateAfterCrash.body.balance).toBe('100');
    expect(stateAfterCrash.body.inventory).toEqual([]);

    // 6. Retry the SAME request (same idempotency key) after restart — should
    // now succeed cleanly and produce exactly one effect.
    const retry = await request(BASE_URL)
      .post(`/v1/wallets/${playerId}/purchase`)
      .set('Idempotency-Key', 'crash-key-1')
      .send({ itemId: 'sword', price: 40 });

    expect(retry.status).toBe(201);

    const finalState = await request(BASE_URL).get(`/v1/wallets/${playerId}`);
    expect(finalState.body.balance).toBe('60');
    expect(finalState.body.inventory).toEqual(['sword']);

    server.kill();
  }, 20000); // longer timeout — this test spawns real processes and waits
});