function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER;
}

function validateCredit(req, res, next) {
  const { amount, reason } = req.body || {};
  if (!isPositiveInt(amount)) {
    return res.status(400).json({ error: 'amount must be a positive integer' });
  }
  if (typeof reason !== 'string' || reason.length === 0 || reason.length > 200) {
    return res.status(400).json({ error: 'reason must be a non-empty string' });
  }
  next();
}

function validatePurchase(req, res, next) {
  const { itemId, price } = req.body || {};
  if (typeof itemId !== 'string' || itemId.length === 0 || itemId.length > 100) {
    return res.status(400).json({ error: 'itemId must be a non-empty string' });
  }
  if (!isPositiveInt(price)) {
    return res.status(400).json({ error: 'price must be a positive integer' });
  }
  next();
}

function validateClaim(req, res, next) {
  const { playerId } = req.body || {};
  if (typeof playerId !== 'string' || playerId.length === 0 || playerId.length > 100) {
    return res.status(400).json({ error: 'playerId must be a non-empty string' });
  }
  next();
}

module.exports = { validateCredit, validatePurchase, validateClaim };