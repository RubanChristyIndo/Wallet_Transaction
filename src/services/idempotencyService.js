const crypto = require('crypto');
const { findKey, storeKey } = require('../models/idempotencyModel');

function hashBody(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/**
 * Wraps a business operation with idempotency guarantees.
 * `doWork(client)` must return { status, body } and must NOT commit/rollback itself —
 * the caller's transaction wraps this whole function.
 */
async function withIdempotency(client, { playerId, idempotencyKey, requestBody, doWork }) {
  const requestHash = hashBody(requestBody);

  const existing = await findKey(client, playerId, idempotencyKey);
  if (existing) {
    if (existing.request_hash !== requestHash) {
      // Same key, different payload — this is a client bug, not a legit retry. Reject it
      // rather than silently returning the old response for a different request.
      const err = new Error('Idempotency-Key already used with a different request body');
      err.status = 422;
      throw err;
    }
    return { status: existing.response_status, body: existing.response_body, replayed: true };
  }

  const result = await doWork(client);

  await storeKey(client, {
    playerId,
    idempotencyKey,
    requestHash,
    status: result.status,
    body: result.body,
  });

  return { ...result, replayed: false };
}

module.exports = { withIdempotency };