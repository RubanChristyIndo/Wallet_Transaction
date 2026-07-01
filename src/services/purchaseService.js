const { pool } = require('../models/db');
const walletModel = require('../models/walletModel');
const { withIdempotency } = require('./idempotencyService');

// Only active when explicitly set by the crash-recovery test harness — never
// set in normal dev/prod runs, so this has zero effect on real traffic.
// Purpose: deterministically pause execution between the debit and the grant
// so a test can kill -9 the process while the transaction is open but
// uncommitted, proving the debit-without-grant window rolls back cleanly.
const CRASH_TEST_DELAY_MS = process.env.CRASH_TEST_DELAY_MS
  ? parseInt(process.env.CRASH_TEST_DELAY_MS, 10)
  : 0;

async function purchase({ playerId, itemId, price, idempotencyKey }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await walletModel.ensureWalletExists(client, playerId);

    const result = await withIdempotency(client, {
      playerId,
      idempotencyKey,
      requestBody: { itemId, price },
      doWork: async (client) => {
        // Atomic: conditional UPDATE either takes the money or touches nothing.
        const debited = await walletModel.debitIfAffordable(client, playerId, price);

        if (!debited) {
          // Insufficient funds is a well-defined, deliberately-cached rejection —
          // a retry of this same request should keep returning 409, not re-attempt.
          return {
            status: 409,
            body: { error: 'insufficient_funds' },
          };
        }

        // TEST HOOK: artificial pause, active only under CRASH_TEST_DELAY_MS.
        // While this is active the transaction is open (debit applied, not
        // committed) — the exact window requirement #3 says must be all-or-nothing.
        if (CRASH_TEST_DELAY_MS > 0) {
          await new Promise(resolve => setTimeout(resolve, CRASH_TEST_DELAY_MS));
        }

        // Grant happens in the SAME transaction as the debit — this is what "atomic"
        // means here. If the process dies between these two lines, the whole
        // transaction is uncommitted and rolls back entirely on restart.
        await walletModel.grantItem(client, playerId, itemId);
        await client.query(
          `INSERT INTO ledger (player_id, delta, reason) VALUES ($1, $2, $3)`,
          [playerId, -price, `purchase:${itemId}`]
        );

        return {
          status: 201,
          body: { balance: debited.balance, itemId },
        };
      },
    });

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { purchase };