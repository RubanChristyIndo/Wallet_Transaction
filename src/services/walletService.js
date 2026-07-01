const { pool } = require('../models/db');
const walletModel = require('../models/walletModel');
const { withIdempotency } = require('./idempotencyService');

async function creditWallet({ playerId, amount, reason, idempotencyKey }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await walletModel.ensureWalletExists(client, playerId);

    const result = await withIdempotency(client, {
      playerId,
      idempotencyKey,
      requestBody: { amount, reason },
      doWork: async (client) => {
        const newBalance = await walletModel.credit(client, playerId, amount, reason);
        return { status: 200, body: { balance: newBalance } };
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

async function getWalletState(playerId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await walletModel.ensureWalletExists(client, playerId);
    const wallet = await walletModel.getWallet(client, playerId);
    const inventory = await walletModel.getInventory(client, playerId);
    const claimedRewards = await walletModel.getClaimedRewards(client, playerId);
    await client.query('COMMIT');
    return { balance: wallet.balance, inventory, claimedRewards };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { creditWallet, getWalletState };