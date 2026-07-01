function requireIdempotencyKey(req, res, next) {
  const key = req.header('Idempotency-Key');
  if (!key || typeof key !== 'string' || key.length === 0 || key.length > 200) {
    return res.status(400).json({ error: 'Idempotency-Key header is required' });
  }
  req.idempotencyKey = key;
  next();
}

module.exports = { requireIdempotencyKey };