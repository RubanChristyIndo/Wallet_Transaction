const express = require('express');
const walletRoutes = require('./routes/wallet.routes');
const purchaseRoutes = require('./routes/purchase.routes');
const rewardRoutes = require('./routes/reward.routes');

const app = express();

// Guard against malformed/garbage JSON crashing the process (requirement #6)
app.use(express.json({
  limit: '10kb',
  strict: true,
}));

app.use((err, req, res, next) => {
  // express.json() throws a SyntaxError for malformed JSON — catch it here
  // before it reaches route handlers.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'malformed JSON body' });
  }
  next(err);
});

app.use('/v1/wallets', walletRoutes);
app.use('/v1/wallets', purchaseRoutes);
app.use('/v1/rewards', rewardRoutes);

// Final error handler — nothing should ever crash the process
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'internal_error' });
});

module.exports = app;