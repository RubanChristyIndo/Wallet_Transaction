const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/models/db');
const { resetDb, randomPlayerId } = require('./testHelpers');

beforeEach(resetDb);
afterAll(() => pool.end());

describe('Concurrency', () => {
  test('two simultaneous purchases racing a balance that affords only one: exactly one wins', async () => {
    const playerId = randomPlayerId();

    // Wallet can afford exactly one 60-cost item, not two
    await request(app)
      .post(`/v1/wallets/${playerId}/credit`)
      .set('Idempotency-Key', 'seed')
      .send({ amount: 60, reason: 'seed' });

    // Fire both purchases truly concurrently — different idempotency keys,
    // so this tests the BALANCE race, not the idempotency dedupe path.
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/v1/wallets/${playerId}/purchase`)
        .set('Idempotency-Key', 'race-key-A')
        .send({ itemId: 'sword', price: 60 }),
      request(app)
        .post(`/v1/wallets/${playerId}/purchase`)
        .set('Idempotency-Key', 'race-key-B')
        .send({ itemId: 'shield', price: 60 }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]); // exactly one success, one rejection

    const state = await request(app).get(`/v1/wallets/${playerId}`);
    expect(state.body.balance).toBe('0');           // never negative, never untouched-twice
    expect(state.body.inventory.length).toBe(1);    // exactly one item granted
  });

  test('many concurrent purchases against a limited balance never overspend', async () => {
    const playerId = randomPlayerId();

    // Affords exactly 3 purchases of 10 each
    await request(app)
      .post(`/v1/wallets/${playerId}/credit`)
      .set('Idempotency-Key', 'seed')
      .send({ amount: 30, reason: 'seed' });

    const attempts = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post(`/v1/wallets/${playerId}/purchase`)
        .set('Idempotency-Key', `bulk-key-${i}`)
        .send({ itemId: `item-${i}`, price: 10 })
    );

    const results = await Promise.all(attempts);
    const successes = results.filter(r => r.status === 201);
    const rejections = results.filter(r => r.status === 409);

    expect(successes.length).toBe(3);
    expect(rejections.length).toBe(7);

    const state = await request(app).get(`/v1/wallets/${playerId}`);
    expect(state.body.balance).toBe('0'); // never negative
    expect(state.body.inventory.length).toBe(3);
  });

  test('concurrent credits to the same wallet all apply, no lost updates', async () => {
    const playerId = randomPlayerId();

    const attempts = Array.from({ length: 20 }, (_, i) =>
      request(app)
        .post(`/v1/wallets/${playerId}/credit`)
        .set('Idempotency-Key', `credit-race-${i}`)
        .send({ amount: 5, reason: 'battle_win' })
    );

    await Promise.all(attempts);

    const state = await request(app).get(`/v1/wallets/${playerId}`);
    expect(state.body.balance).toBe('100'); // 20 * 5, none lost to a race
  });
});