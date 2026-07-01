const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/models/db');
const { resetDb, randomPlayerId } = require('./testHelpers');

beforeEach(resetDb);
afterAll(() => pool.end());

describe('Idempotency', () => {
  test('duplicate credit requests with the same key apply exactly once', async () => {
    const playerId = randomPlayerId();
    const key = 'credit-key-1';
    const body = { amount: 100, reason: 'battle_win' };

    const first = await request(app)
      .post(`/v1/wallets/${playerId}/credit`)
      .set('Idempotency-Key', key)
      .send(body);

    const second = await request(app)
      .post(`/v1/wallets/${playerId}/credit`)
      .set('Idempotency-Key', key)
      .send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Same response body both times — proves it was replayed, not re-executed
    expect(second.body).toEqual(first.body);

    const state = await request(app).get(`/v1/wallets/${playerId}`);
    expect(state.body.balance).toBe('100'); // NOT '200' — proves single effect
  });

  test('duplicate purchase requests with the same key apply exactly once', async () => {
    const playerId = randomPlayerId();

    await request(app)
      .post(`/v1/wallets/${playerId}/credit`)
      .set('Idempotency-Key', 'seed-credit')
      .send({ amount: 100, reason: 'seed' });

    const purchaseBody = { itemId: 'sword', price: 40 };
    const key = 'purchase-key-1';

    const first = await request(app)
      .post(`/v1/wallets/${playerId}/purchase`)
      .set('Idempotency-Key', key)
      .send(purchaseBody);

    const second = await request(app)
      .post(`/v1/wallets/${playerId}/purchase`)
      .set('Idempotency-Key', key)
      .send(purchaseBody);

    expect(first.status).toBe(201);
    expect(second.body).toEqual(first.body);

    const state = await request(app).get(`/v1/wallets/${playerId}`);
    expect(state.body.balance).toBe('60');       // debited once, not twice
    expect(state.body.inventory).toEqual(['sword']); // granted once, not twice
  });

  test('same key with a different request body is rejected, not replayed', async () => {
    const playerId = randomPlayerId();
    const key = 'reused-key';

    await request(app)
      .post(`/v1/wallets/${playerId}/credit`)
      .set('Idempotency-Key', key)
      .send({ amount: 100, reason: 'battle_win' });

    const conflicting = await request(app)
      .post(`/v1/wallets/${playerId}/credit`)
      .set('Idempotency-Key', key)
      .send({ amount: 999, reason: 'different_payload' });

    expect(conflicting.status).toBe(422);
  });

  test('claiming the same reward twice returns alreadyClaimed, no duplicate grant', async () => {
    const playerId = randomPlayerId();

    const first = await request(app)
      .post('/v1/rewards/daily1/claim')
      .send({ playerId });
    const second = await request(app)
      .post('/v1/rewards/daily1/claim')
      .send({ playerId });

    expect(first.status).toBe(201);
    expect(first.body.alreadyClaimed).toBe(false);
    expect(second.status).toBe(200);
    expect(second.body.alreadyClaimed).toBe(true);

    const state = await request(app).get(`/v1/wallets/${playerId}`);
    expect(state.body.claimedRewards).toEqual(['daily1']); // once, not twice
  });
});