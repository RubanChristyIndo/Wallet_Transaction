const { pool } = require('../src/models/db');

async function resetDb() {
  // TRUNCATE ... CASCADE wipes all tables and resets identity counters,
  // giving each test file a clean slate. Safe here because this only
  // ever runs against the test database, never production.
  await pool.query(`
    TRUNCATE wallets, ledger, inventory, claimed_rewards, idempotency_keys
    RESTART IDENTITY CASCADE
  `);
}

function randomPlayerId(prefix = 'player') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { resetDb, randomPlayerId };