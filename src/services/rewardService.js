const { pool } = require('../models/db');
const walletModel = require('../models/walletModel');

async function claimReward({ rewardId, playerId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await walletModel.ensureWalletExists(client, playerId);

    // No separate idempotency table needed here — the (player_id, reward_id)
    // primary key on claimed_rewards IS the dedupe mechanism. A second claim
    // attempt is naturally idempotent: it's not an error, it's just "already yours."
    const existing = await client.query(
      'SELECT 1 FROM claimed_rewards WHERE player_id = $1 AND reward_id = $2',
      [playerId, rewardId]
    );

    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return { status: 200, body: { rewardId, claimed: true, alreadyClaimed: true } };
    }

    try {
      await client.query(
        'INSERT INTO claimed_rewards (player_id, reward_id) VALUES ($1, $2)',
        [playerId, rewardId]
      );
    } catch (err) {
      if (err.code === '23505') {
        // Unique violation = a concurrent request beat us to it between the SELECT
        // and this INSERT. That's fine — it means the reward IS claimed, which is
        // the outcome we want. Treat it as success, not an error.
        await client.query('COMMIT');
        return { status: 200, body: { rewardId, claimed: true, alreadyClaimed: true } };
      }
      throw err;
    }

    await client.query('COMMIT');
    return { status: 201, body: { rewardId, claimed: true, alreadyClaimed: false } };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { claimReward };