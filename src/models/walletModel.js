async function getWallet(client, playerId) {
  const res = await client.query(
    'SELECT player_id, balance FROM wallets WHERE player_id = $1',
    [playerId]
  );
  return res.rows[0] || null;
}

async function ensureWalletExists(client, playerId) {
  // Auto-create a wallet on first touch (earn or read) — avoids a separate "create account" step,
  // which is explicitly out of scope for this assessment.
  await client.query(
    `INSERT INTO wallets (player_id, balance) VALUES ($1, 0)
     ON CONFLICT (player_id) DO NOTHING`,
    [playerId]
  );
}

async function credit(client, playerId, amount, reason) {
  const res = await client.query(
    `UPDATE wallets SET balance = balance + $1 WHERE player_id = $2 RETURNING balance`,
    [amount, playerId]
  );
  await client.query(
    `INSERT INTO ledger (player_id, delta, reason) VALUES ($1, $2, $3)`,
    [playerId, amount, reason]
  );
  return res.rows[0].balance;
}

async function debitIfAffordable(client, playerId, price) {
  // The core atomicity trick: a single conditional UPDATE. Postgres takes a row-level
  // lock for the duration of this statement, so two concurrent debits on the same wallet
  // serialize here — the second one re-evaluates `balance >= price` against the
  // post-first-debit value. No explicit SELECT ... FOR UPDATE needed.
  const res = await client.query(
    `UPDATE wallets SET balance = balance - $1
     WHERE player_id = $2 AND balance >= $1
     RETURNING balance`,
    [price, playerId]
  );
  return res.rows[0] || null; // null = insufficient funds, nothing was touched
}

async function getInventory(client, playerId) {
  const res = await client.query(
    'SELECT item_id FROM inventory WHERE player_id = $1 ORDER BY acquired_at',
    [playerId]
  );
  return res.rows.map(r => r.item_id);
}

async function grantItem(client, playerId, itemId) {
  await client.query(
    'INSERT INTO inventory (player_id, item_id) VALUES ($1, $2)',
    [playerId, itemId]
  );
}

async function getClaimedRewards(client, playerId) {
  const res = await client.query(
    'SELECT reward_id FROM claimed_rewards WHERE player_id = $1',
    [playerId]
  );
  return res.rows.map(r => r.reward_id);
}

module.exports = {
  getWallet,
  ensureWalletExists,
  credit,
  debitIfAffordable,
  getInventory,
  grantItem,
  getClaimedRewards,
};