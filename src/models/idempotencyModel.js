async function findKey(client, playerId, idempotencyKey) {
  // FOR UPDATE locks the row (if it exists) so a concurrent duplicate request
  // blocks here until the first one finishes, rather than both proceeding.
  const res = await client.query(
    `SELECT * FROM idempotency_keys WHERE player_id = $1 AND idempotency_key = $2 FOR UPDATE`,
    [playerId, idempotencyKey]
  );
  return res.rows[0] || null;
}

async function storeKey(client, { playerId, idempotencyKey, requestHash, status, body }) {
  await client.query(
    `INSERT INTO idempotency_keys
       (player_id, idempotency_key, request_hash, response_status, response_body)
     VALUES ($1, $2, $3, $4, $5)`,
    [playerId, idempotencyKey, requestHash, status, JSON.stringify(body)]
  );
}

module.exports = { findKey, storeKey };